import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadRecords } from '../src/lib/catalog/load';
import { contentHash } from './compare';
import {
  consolidateDiscoveryCandidates,
  discoveryCandidateScore,
  discoverFromSource,
  discoveryProposal,
  isCollectionListingUrl,
  validateDiscoveryCandidate,
  type DiscoveryCandidate,
} from './discovery';
import { fetchSource } from './fetch';
import { knownRecordChangeProposal } from './known-records';
import {
  candidateValidationBatch,
  loadPendingCandidates,
  savePendingCandidates,
} from './pending-candidates';
import { markdownReport, type MonitorSummary } from './report';
import {
  loadMonitorState,
  restoreStateForRetry,
  sourceCheckIsDue,
  stateFromFailure,
  stateFromResult,
  type MonitorSourceState,
} from './state';

interface ProviderConfiguration {
  providers: Array<{
    name: string;
    approved_domains: string[];
    official_collection_pages: string[];
    feeds: string[];
    sitemaps: string[];
    enabled: boolean;
  }>;
}

type DiscoverySource = {
  url: string;
  kind: 'official-listing' | 'official-feed' | 'official-calendar' | 'official-sitemap';
};

const MAX_CANDIDATE_VALIDATIONS = 50;
const MAX_REVIEW_PROPOSALS = 20;
const MAX_TRANSIENT_CANDIDATE_FAILURES = 3;

export function isRetryableDetailStatus(status: number) {
  return [408, 425, 429].includes(status) || (status >= 500 && status <= 599);
}

export function isRetryableDetailError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = error.cause instanceof Error ? (error.cause as NodeJS.ErrnoException) : null;
  const code = (error as NodeJS.ErrnoException).code || cause?.code || '';
  return (
    ['AbortError', 'TimeoutError'].includes(error.name) ||
    ['EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(
      code,
    ) ||
    /fetch failed|network|socket|terminated|timed?\s*out/i.test(error.message)
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index]!);
      }
    }),
  );
  return results;
}

function providerSources(provider: ProviderConfiguration['providers'][number]) {
  const sources: DiscoverySource[] = [
    ...provider.official_collection_pages.map((url) => ({
      url,
      kind: 'official-listing' as const,
    })),
    ...provider.feeds.map((url) => ({
      url,
      kind: /\.ics(?:\?|$)/i.test(url)
        ? ('official-calendar' as const)
        : ('official-feed' as const),
    })),
    ...provider.sitemaps.map((url) => ({
      url,
      kind: 'official-sitemap' as const,
    })),
  ];
  return [...new Map(sources.map((source) => [source.url, source])).values()];
}

export async function runMonitor(mode: string, recordId?: string) {
  const root = process.cwd();
  const statePath = path.join(root, 'work', 'automation-state', 'state.json');
  const pendingPath = path.join(root, 'work', 'automation-state', 'pending-candidates.json');
  await mkdir(path.dirname(statePath), { recursive: true });
  const state = await loadMonitorState(statePath);
  const records = await loadRecords();
  const selected = recordId
    ? records.filter((record) => record.id === recordId)
    : mode === 'priority'
      ? records.filter((record) => {
          if (!record.dates.event.start) return false;
          const difference = Date.parse(record.dates.event.start) - Date.now();
          return difference >= 0 && difference < 60 * 86_400_000;
        })
      : records;
  const live =
    ['morning', 'priority', 'record'].includes(mode) && process.env.MONITOR_LIVE === 'true';
  const summary: MonitorSummary = {
    mode,
    checkedAt: new Date().toISOString(),
    sourcesChecked: 0,
    successful: 0,
    failed: 0,
    changed: 0,
    proposals: 0,
    conflicts: 0,
    rawCandidates: 0,
    filteredCandidates: 0,
    validatedCandidates: 0,
    rejectedCandidates: 0,
    duplicateCandidates: 0,
    suppressedCandidates: 0,
    validationFailures: 0,
    pendingCandidates: 0,
    deferredSources: 0,
    contentOnlyChangesSuppressed: 0,
    safetyGateTripped: false,
    warnings: [],
  };
  let proposals: ReturnType<typeof discoveryProposal>[] = [];

  if (live && mode === 'morning') {
    const configuration = YAML.parse(
      await readFile(path.join(root, 'configuration', 'providers.yml'), 'utf8'),
    ) as ProviderConfiguration;
    const discovered: DiscoveryCandidate[] = [];
    const pendingAtStart = await loadPendingCandidates(pendingPath);
    const retryQueue: DiscoveryCandidate[] = [];
    const candidateSourceCheckpoints = new Map<
      string,
      Array<{ stateKey: string; previous?: MonitorSourceState }>
    >();
    let skippedDetailSources = 0;

    const registerCandidateSource = (
      candidate: DiscoveryCandidate,
      stateKey: string,
      previous?: MonitorSourceState,
    ) => {
      const checkpoints = candidateSourceCheckpoints.get(candidate.url) || [];
      if (!checkpoints.some((checkpoint) => checkpoint.stateKey === stateKey))
        checkpoints.push({ stateKey, ...(previous ? { previous } : {}) });
      candidateSourceCheckpoints.set(candidate.url, checkpoints);
    };
    const retryCandidateSource = (candidate: DiscoveryCandidate, previous?: MonitorSourceState) => {
      if ((previous?.failure_count ?? 0) >= MAX_TRANSIENT_CANDIDATE_FAILURES) return;
      for (const checkpoint of candidateSourceCheckpoints.get(candidate.url) || [])
        restoreStateForRetry(state, checkpoint.stateKey, checkpoint.previous);
    };

    for (const provider of configuration.providers.filter((entry) => entry.enabled))
      for (const source of providerSources(provider)) {
        const stateKey = `discovery:${provider.name}:${source.url}`;
        const previous = state[stateKey];
        if (!sourceCheckIsDue(previous, summary.checkedAt)) {
          summary.deferredSources += 1;
          continue;
        }
        summary.sourcesChecked += 1;
        try {
          const sourceHost = new URL(source.url).hostname;
          const approvedDomains = [...new Set([...provider.approved_domains, sourceHost])];
          const result = await fetchSource(source.url, {
            approvedDomains,
            ...(process.env.CATALOG_USER_AGENT
              ? { userAgent: process.env.CATALOG_USER_AGENT }
              : {}),
            ...(process.env.CATALOG_CONTACT ? { contact: process.env.CATALOG_CONTACT } : {}),
            ...(previous?.etag ? { etag: previous.etag } : {}),
            ...(previous?.last_modified ? { lastModified: previous.last_modified } : {}),
          });
          state[stateKey] = stateFromResult(
            stateKey,
            summary.checkedAt,
            result,
            result.status === 304 ? null : contentHash(result.body),
            previous,
          );
          if (result.status >= 400) {
            summary.failed += 1;
            summary.warnings.push(
              `${provider.name}: HTTP ${result.status} for ${source.url}; no candidate created.`,
            );
            continue;
          }
          summary.successful += 1;
          if (result.status === 304) continue;
          if (source.kind === 'official-listing' && !isCollectionListingUrl(result.finalUrl)) {
            skippedDetailSources += 1;
            continue;
          }
          const sourceCandidates = discoverFromSource(
            result.body,
            result.finalUrl,
            provider.name,
            approvedDomains,
            source.kind,
          )
            .sort((a, b) => discoveryCandidateScore(b) - discoveryCandidateScore(a))
            .slice(0, 50);
          for (const candidate of sourceCandidates)
            registerCandidateSource(candidate, stateKey, previous);
          discovered.push(...sourceCandidates);
        } catch (error) {
          state[stateKey] = stateFromFailure(stateKey, summary.checkedAt, previous);
          summary.failed += 1;
          summary.warnings.push(
            `${provider.name}: ${error instanceof Error ? error.message : 'fetch failed'}; no candidate created.`,
          );
        }
      }

    summary.rawCandidates = discovered.length;
    const validationBatch = candidateValidationBatch(
      pendingAtStart,
      discovered,
      records,
      MAX_CANDIDATE_VALIDATIONS,
    );
    summary.filteredCandidates = validationBatch.total;
    summary.duplicateCandidates = validationBatch.duplicates;
    const candidates = validationBatch.batch;
    if (skippedDetailSources)
      summary.warnings.push(
        `Skipped link mining on ${skippedDetailSources} individual course or archive pages.`,
      );
    if (validationBatch.remaining.length)
      summary.warnings.push(
        `Queued ${validationBatch.remaining.length} deduplicated links beyond this run's ${MAX_CANDIDATE_VALIDATIONS}-page validation batch.`,
      );
    const rejectionReasons = new Map<string, number>();
    const validationFailureMessages: string[] = [];
    const validated = await mapWithConcurrency(candidates, 3, async (candidate) => {
      const stateKey = `candidate:${candidate.url}`;
      const previous = state[stateKey];
      try {
        const domain = new URL(candidate.url).hostname;
        const result = await fetchSource(candidate.url, {
          approvedDomains: [domain],
          timeoutMs: 10_000,
          ...(process.env.CATALOG_USER_AGENT ? { userAgent: process.env.CATALOG_USER_AGENT } : {}),
          ...(process.env.CATALOG_CONTACT ? { contact: process.env.CATALOG_CONTACT } : {}),
          ...(previous?.failure_count === 0 && previous.etag ? { etag: previous.etag } : {}),
          ...(previous?.failure_count === 0 && previous.last_modified
            ? { lastModified: previous.last_modified }
            : {}),
        });
        const currentHash = result.status === 304 ? null : contentHash(result.body);
        const nextState = stateFromResult(
          stateKey,
          summary.checkedAt,
          result,
          currentHash,
          previous,
        );
        state[stateKey] = nextState;
        if (result.status >= 400) {
          if (
            isRetryableDetailStatus(result.status) &&
            nextState.failure_count <= MAX_TRANSIENT_CANDIDATE_FAILURES
          ) {
            retryCandidateSource(candidate, previous);
            retryQueue.push(candidate);
          }
          summary.validationFailures += 1;
          validationFailureMessages.push(
            `${candidate.provider}: candidate verification HTTP ${result.status} for ${candidate.url}.`,
          );
          return null;
        }
        if (
          result.status === 304 ||
          (currentHash && previous?.content_hash && currentHash === previous.content_hash)
        ) {
          summary.suppressedCandidates += 1;
          return null;
        }
        const validation = validateDiscoveryCandidate(candidate, result.body, result.finalUrl);
        if (!validation.accepted) {
          summary.rejectedCandidates += 1;
          for (const reason of validation.reasons)
            rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + 1);
          return null;
        }
        return { candidate: validation.candidate, nextState };
      } catch (error) {
        state[stateKey] = stateFromFailure(stateKey, summary.checkedAt, previous);
        if (
          isRetryableDetailError(error) &&
          state[stateKey]!.failure_count <= MAX_TRANSIENT_CANDIDATE_FAILURES
        ) {
          retryCandidateSource(candidate, previous);
          retryQueue.push(candidate);
        }
        summary.validationFailures += 1;
        validationFailureMessages.push(
          `${candidate.provider}: candidate verification ${error instanceof Error ? error.message : 'fetch failed'} for ${candidate.url}.`,
        );
        return null;
      }
    });
    const verified = validated.filter((result): result is NonNullable<typeof result> => !!result);
    const consolidated = consolidateDiscoveryCandidates(
      verified.map((result) => result.candidate),
      records,
    );
    summary.duplicateCandidates += consolidated.duplicates;
    proposals = consolidated.candidates.map((candidate) => {
      const proposal = discoveryProposal(candidate, summary.checkedAt);
      const verifiedResult = verified.find((result) => result.candidate.url === candidate.url);
      if (verifiedResult) verifiedResult.nextState.last_proposal_id = proposal.proposal_id;
      return proposal;
    });
    summary.validatedCandidates = verified.length;
    summary.changed = proposals.length;
    if (verified.length > proposals.length)
      summary.warnings.push(
        `Consolidated ${verified.length - proposals.length} overlapping verified pages into canonical review candidates.`,
      );
    for (const [reason, count] of [...rejectionReasons.entries()].sort((a, b) => b[1] - a[1]))
      summary.warnings.push(`Candidate filter: ${count} rejected for ${reason}.`);
    summary.warnings.push(...validationFailureMessages.slice(0, 10));
    if (validationFailureMessages.length > 10)
      summary.warnings.push(
        `${validationFailureMessages.length - 10} additional candidate verification failures were omitted from this summary.`,
      );
    const pendingAfterRun = [...validationBatch.remaining, ...retryQueue];
    await savePendingCandidates(pendingPath, pendingAfterRun);
    summary.pendingCandidates = pendingAfterRun.length;
    summary.safetyGateTripped = proposals.length > MAX_REVIEW_PROPOSALS;
    if (summary.safetyGateTripped)
      summary.warnings.push(
        `Safety gate blocked pull-request creation because ${proposals.length} proposals exceeded the limit of ${MAX_REVIEW_PROPOSALS}.`,
      );
  } else if (live) {
    summary.sourcesChecked = 0;
    for (const record of selected) {
      const previous = state[record.id];
      if (mode !== 'record' && !sourceCheckIsDue(previous, summary.checkedAt)) {
        summary.deferredSources += 1;
        continue;
      }
      summary.sourcesChecked += 1;
      try {
        const domain = new URL(record.sources.official_url).hostname;
        const result = await fetchSource(record.sources.official_url, {
          approvedDomains: [domain],
          ...(process.env.CATALOG_USER_AGENT ? { userAgent: process.env.CATALOG_USER_AGENT } : {}),
          ...(process.env.CATALOG_CONTACT ? { contact: process.env.CATALOG_CONTACT } : {}),
          ...(previous?.etag ? { etag: previous.etag } : {}),
          ...(previous?.last_modified ? { lastModified: previous.last_modified } : {}),
        });
        const currentHash = result.status === 304 ? null : contentHash(result.body);
        const nextState = stateFromResult(
          record.id,
          summary.checkedAt,
          result,
          currentHash,
          previous,
        );
        state[record.id] = nextState;
        if (result.status < 400) {
          summary.successful += 1;
          if (
            result.status !== 304 &&
            previous?.content_hash &&
            currentHash &&
            previous.content_hash !== currentHash
          ) {
            const proposal = knownRecordChangeProposal(
              record,
              result.body,
              summary.checkedAt,
              currentHash,
            );
            if (proposal) {
              proposals.push(proposal);
              summary.changed += 1;
              nextState.last_proposal_id = proposal.proposal_id;
            } else summary.contentOnlyChangesSuppressed += 1;
          }
        } else {
          summary.failed += 1;
          summary.warnings.push(
            `${record.id}: HTTP ${result.status}; retained without factual change.`,
          );
        }
      } catch (error) {
        state[record.id] = stateFromFailure(record.id, summary.checkedAt, previous);
        summary.failed += 1;
        summary.warnings.push(
          `${record.id}: ${error instanceof Error ? error.message : 'fetch failed'}; retained without factual change.`,
        );
      }
    }
  } else
    summary.warnings.push(
      'Fixture/dry-run mode: no live provider pages were requested and no factual changes were applied.',
    );

  summary.proposals = proposals.length;
  if (proposals.length > MAX_REVIEW_PROPOSALS) {
    summary.safetyGateTripped = true;
    if (!summary.warnings.some((warning) => warning.startsWith('Safety gate blocked')))
      summary.warnings.push(
        `Safety gate blocked pull-request creation because ${proposals.length} proposals exceeded the limit of ${MAX_REVIEW_PROPOSALS}.`,
      );
  }

  await mkdir(path.join(root, 'work', 'automation-state'), { recursive: true });
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const reportMode = mode.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const runTimestamp = summary.checkedAt.replace(/[:.]/g, '-');
  const runDirectory = path.join(
    root,
    'reports',
    'monitor',
    summary.checkedAt.slice(0, 10),
    `${runTimestamp}-${reportMode}`,
  );
  const report = markdownReport(summary);
  const proposalJson = `${JSON.stringify(proposals, null, 2)}\n`;
  await mkdir(runDirectory, { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await Promise.all([
    writeFile(path.join(root, 'reports', 'latest-monitor.md'), report),
    writeFile(path.join(root, 'reports', `latest-${reportMode}.md`), report),
    writeFile(path.join(root, 'reports', 'proposals.json'), proposalJson),
    writeFile(path.join(root, 'reports', `proposals-${reportMode}.json`), proposalJson),
    writeFile(path.join(runDirectory, 'report.md'), report),
    writeFile(path.join(runDirectory, 'proposals.json'), proposalJson),
  ]);
  return summary;
}
