import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadRecords } from '../src/lib/catalog/load';
import { contentHash } from './compare';
import {
  discoverFromSource,
  discoveryProposal,
  newDiscoveryCandidates,
  type DiscoveryCandidate,
} from './discovery';
import { fetchSource } from './fetch';
import { markdownReport, type MonitorSummary } from './report';

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

function sourceState(checkedAt: string, result: Awaited<ReturnType<typeof fetchSource>>) {
  return {
    checked_at: checkedAt,
    status: result.status,
    final_url: result.finalUrl,
    redirect_chain: result.redirects,
    etag: result.etag,
    last_modified: result.lastModified,
    content_hash: contentHash(result.body),
    failure_count: result.status >= 400 ? 1 : 0,
  };
}

export async function runMonitor(mode: string, recordId?: string) {
  const root = process.cwd();
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
    warnings: [],
  };
  const state: Record<string, unknown> = {};
  let proposals: ReturnType<typeof discoveryProposal>[] = [];

  if (live && mode === 'morning') {
    const configuration = YAML.parse(
      await readFile(path.join(root, 'configuration', 'providers.yml'), 'utf8'),
    ) as ProviderConfiguration;
    const discovered: DiscoveryCandidate[] = [];

    for (const provider of configuration.providers.filter((entry) => entry.enabled))
      for (const source of providerSources(provider)) {
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
          });
          state[`discovery:${provider.name}:${source.url}`] = sourceState(
            summary.checkedAt,
            result,
          );
          if (result.status >= 400) {
            summary.failed += 1;
            summary.warnings.push(
              `${provider.name}: HTTP ${result.status} for ${source.url}; no candidate created.`,
            );
            continue;
          }
          summary.successful += 1;
          discovered.push(
            ...discoverFromSource(
              result.body,
              result.finalUrl,
              provider.name,
              approvedDomains,
              source.kind,
            ).slice(0, 25),
          );
        } catch (error) {
          summary.failed += 1;
          summary.warnings.push(
            `${provider.name}: ${error instanceof Error ? error.message : 'fetch failed'}; no candidate created.`,
          );
        }
      }

    const candidates = newDiscoveryCandidates(discovered, records);
    if (candidates.length > 100)
      summary.warnings.push(
        `Discovery found ${candidates.length} candidate links; the review list was capped at 100.`,
      );
    proposals = candidates
      .slice(0, 100)
      .map((candidate) => discoveryProposal(candidate, summary.checkedAt));
    summary.changed = candidates.length;
    summary.proposals = proposals.length;
  } else if (live) {
    summary.sourcesChecked = selected.length;
    for (const record of selected) {
      try {
        const domain = new URL(record.sources.official_url).hostname;
        const result = await fetchSource(record.sources.official_url, {
          approvedDomains: [domain],
          ...(process.env.CATALOG_USER_AGENT ? { userAgent: process.env.CATALOG_USER_AGENT } : {}),
          ...(process.env.CATALOG_CONTACT ? { contact: process.env.CATALOG_CONTACT } : {}),
        });
        state[record.id] = sourceState(summary.checkedAt, result);
        if (result.status < 400) summary.successful += 1;
        else {
          summary.failed += 1;
          summary.warnings.push(
            `${record.id}: HTTP ${result.status}; retained without factual change.`,
          );
        }
      } catch (error) {
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

  await mkdir(path.join(root, 'work', 'automation-state'), { recursive: true });
  await mkdir(path.join(root, 'reports'), { recursive: true });
  await writeFile(
    path.join(root, 'work', 'automation-state', 'state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  await writeFile(path.join(root, 'reports', 'latest-monitor.md'), markdownReport(summary));
  await writeFile(
    path.join(root, 'reports', 'proposals.json'),
    `${JSON.stringify(proposals, null, 2)}\n`,
  );
  return summary;
}
