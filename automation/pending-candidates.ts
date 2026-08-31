import { readFile, writeFile } from 'node:fs/promises';
import type { CatalogRecord } from '../src/lib/catalog/schema';
import {
  filterNewDiscoveryCandidates,
  normalizeDiscoveryUrl,
  type DiscoveryCandidate,
} from './discovery';

function isCandidate(value: unknown): value is DiscoveryCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.provider === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.evidenceUrl === 'string' &&
    ['official-listing', 'official-feed', 'official-calendar', 'official-sitemap'].includes(
      String(candidate.sourceKind),
    ) &&
    ['medium', 'high'].includes(String(candidate.confidence))
  );
}

export async function loadPendingCandidates(file: string): Promise<DiscoveryCandidate[]> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCandidate) : [];
  } catch {
    return [];
  }
}

export function candidateValidationBatch(
  pending: DiscoveryCandidate[],
  discovered: DiscoveryCandidate[],
  records: CatalogRecord[],
  limit: number,
) {
  const filtered = filterNewDiscoveryCandidates([...pending, ...discovered], records);
  const pendingUrls = new Set(
    pending.map((candidate) => normalizeDiscoveryUrl(candidate.url)).filter(Boolean),
  );
  const candidates = [...filtered.candidates].sort(
    (left, right) => Number(pendingUrls.has(right.url)) - Number(pendingUrls.has(left.url)),
  );
  return {
    batch: candidates.slice(0, limit),
    remaining: candidates.slice(limit),
    duplicates: filtered.duplicates,
    total: filtered.candidates.length,
  };
}

export function uniquePendingCandidates(candidates: DiscoveryCandidate[]) {
  const unique = new Map<string, DiscoveryCandidate>();
  for (const candidate of candidates) {
    const url = normalizeDiscoveryUrl(candidate.url);
    if (url && !unique.has(url)) unique.set(url, { ...candidate, url });
  }
  return [...unique.values()];
}

export async function savePendingCandidates(file: string, candidates: DiscoveryCandidate[]) {
  await writeFile(file, `${JSON.stringify(uniquePendingCandidates(candidates), null, 2)}\n`);
}
