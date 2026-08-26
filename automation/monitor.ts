import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadRecords } from '../src/lib/catalog/load';
import { contentHash } from './compare';
import {
  discoveryCandidateScore,
  discoverFromSource,
  discoveryProposal,
  filterNewDiscoveryCandidates,
  isCollectionListingUrl,
  validateDiscoveryCandidate,
  type DiscoveryCandidate,
} from './discovery';
import { fetchSource } from './fetch';
import { knownRecordChangeProposal } from './known-records';
import { markdownReport, type MonitorSummary } from './report';
import { loadMonitorState, stateFromFailure, stateFromResult } from './state';

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
    safetyGateTripped: false,
    warnings: [],
  };
  let proposals: ReturnType<typeof discoveryProposal>[] = [];

  if (live && mode === 'morning') {
    const configuration = YAML.parse(
      await readFile(path.join(root, 'configuration', 'providers.yml'), 'utf8'),
    ) as ProviderConfiguration;
    const discovered: DiscoveryCandidate[] = [];
    let skippedDetailSources = 0;

    for (const provider of configuration.providers.filter((entry) => entry.enabled))
      for (const source of providerSources(provider)) {
        summary.sourcesChecked += 1;
        const stateKey = `discovery:${provider.name}:${source.url}`;
        const previous = state[stateKey];
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
          discovered.push(
            ...discoverFromSource(
              result.body,
              result.finalUrl,
              provider.name,
              approvedDomains,
              source.kind,
            )
              .sort((a, b) => discoveryCandidateScore(b) - discoveryCandidateScore(a))
              .slice(0, 50),
          );
        } catch (error) {
          state[stateKey] = stateFromFailure(stateKey, summary.checkedAt, previous);
          summary.failed += 1;
          summary.warnings.push(
            `${provider.name}: ${error instanceof Error ? error.message : 'fetch failed'}; no candidate created.`,
          );
        }
      }

    summary.rawCandidates = discovered.length;
    const filtered = filterNewDiscoveryCandidates(discovered, records);
    summary.filteredCandidates = filtered.candidates.length;
    summary.duplicateCandidates = filtered.duplicates;
    const candidates = filtered.candidates.slice(0, MAX_CANDIDATE_VALIDATIONS);
    if (skippedDetailSources)
      summary.warnings.push(
        `Skipped link mining on ${skippedDetailSources} individual course or archive pages.`,
      );
    if (filtered.candidates.length > MAX_CANDIDATE_VALIDATIONS)
      summary.warnings.push(
        `Discovery found ${filtered.candidates.length} deduplicated links; official detail-page validation was capped at ${MAX_CANDIDATE_VALIDATIONS}.`,
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
          ...(previous?.etag ? { etag: previous.etag } : {}),
          ...(previous?.last_modified ? { lastModified: previous.last_modified } : {}),
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
        const finalDeduplication = filterNewDiscoveryCandidates([validation.candidate], records);
        if (!finalDeduplication.candidates.length) {
          summary.duplicateCandidates += 1;
          return null;
        }
        const proposal = discoveryProposal(validation.candidate, summary.checkedAt);
        nextState.last_proposal_id = proposal.proposal_id;
        return proposal;
      } catch (error) {
        state[stateKey] = stateFromFailure(stateKey, summary.checkedAt, previous);
        summary.validationFailures += 1;
        validationFailureMessages.push(
          `${candidate.provider}: candidate verification ${error instanceof Error ? error.message : 'fetch failed'} for ${candidate.url}.`,
        );
        return null;
      }
    });
    proposals = validated.filter(
      (proposal): proposal is NonNullable<typeof proposal> => !!proposal,
    );
    summary.validatedCandidates = proposals.length;
    summary.changed = proposals.length;
    for (const [reason, count] of [...rejectionReasons.entries()].sort((a, b) => b[1] - a[1]))
      summary.warnings.push(`Candidate filter: ${count} rejected for ${reason}.`);
    summary.warnings.push(...validationFailureMessages.slice(0, 10));
    if (validationFailureMessages.length > 10)
      summary.warnings.push(
        `${validationFailureMessages.length - 10} additional candidate verification failures were omitted from this summary.`,
      );
    summary.safetyGateTripped = proposals.length > MAX_REVIEW_PROPOSALS;
    if (summary.safetyGateTripped)
      summary.warnings.push(
        `Safety gate blocked pull-request creation because ${proposals.length} proposals exceeded the limit of ${MAX_REVIEW_PROPOSALS}.`,
      );
  } else if (live) {
    summary.sourcesChecked = selected.length;
    for (const record of selected) {
      const previous = state[record.id];
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
              previous.content_hash,
              currentHash,
            );
            proposals.push(proposal);
            summary.changed += 1;
            nextState.last_proposal_id = proposal.proposal_id;
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
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(path.join(root, 'reports', 'latest-monitor.md'), markdownReport(summary));
  await writeFile(
    path.join(root, 'reports', 'proposals.json'),
    `${JSON.stringify(proposals, null, 2)}\n`,
  );
  return summary;
}
