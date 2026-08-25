import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadRecords } from '../src/lib/catalog/load';
import { contentHash } from './compare';
import { fetchSource } from './fetch';
import { markdownReport, type MonitorSummary } from './report';

export async function runMonitor(mode: string, recordId?: string) {
  const root = process.cwd();
  const records = await loadRecords();
  const selected = recordId
    ? records.filter((record) => record.id === recordId)
    : mode === 'priority'
      ? records.filter(
          (record) =>
            record.dates.event.start &&
            Date.parse(record.dates.event.start) - Date.now() < 60 * 86_400_000,
        )
      : records;
  const live =
    ['morning', 'priority', 'record'].includes(mode) && process.env.MONITOR_LIVE === 'true';
  const summary: MonitorSummary = {
    mode,
    checkedAt: new Date().toISOString(),
    sourcesChecked: live ? selected.length : 0,
    successful: 0,
    failed: 0,
    changed: 0,
    proposals: 0,
    conflicts: 0,
    warnings: [],
  };
  const state: Record<string, unknown> = {};
  if (live)
    for (const record of selected) {
      try {
        const domain = new URL(record.sources.official_url).hostname;
        const result = await fetchSource(record.sources.official_url, {
          approvedDomains: [domain],
          ...(process.env.CATALOG_USER_AGENT ? { userAgent: process.env.CATALOG_USER_AGENT } : {}),
          ...(process.env.CATALOG_CONTACT ? { contact: process.env.CATALOG_CONTACT } : {}),
        });
        state[record.id] = {
          checked_at: summary.checkedAt,
          status: result.status,
          final_url: result.finalUrl,
          redirect_chain: result.redirects,
          etag: result.etag,
          last_modified: result.lastModified,
          content_hash: contentHash(result.body),
          failure_count: result.status >= 400 ? 1 : 0,
        };
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
  else
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
  await writeFile(path.join(root, 'reports', 'proposals.json'), '[]\n');
  return summary;
}
