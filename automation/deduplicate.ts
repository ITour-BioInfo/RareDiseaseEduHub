import type { CatalogRecord } from '../src/lib/catalog/schema';
const words = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 2),
  );
export function similarity(a: CatalogRecord, b: CatalogRecord) {
  if (a.sources.canonical_url === b.sources.canonical_url) return 1;
  const left = words(`${a.content.title_original} ${a.provider.name}`);
  const right = words(`${b.content.title_original} ${b.provider.name}`);
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / Math.max(1, new Set([...left, ...right]).size);
}
export function duplicateCandidates(records: CatalogRecord[], threshold = 0.72) {
  const candidates: { left: string; right: string; score: number }[] = [];
  for (let i = 0; i < records.length; i += 1)
    for (let j = i + 1; j < records.length; j += 1) {
      const score = similarity(records[i]!, records[j]!);
      if (score >= threshold)
        candidates.push({ left: records[i]!.id, right: records[j]!.id, score });
    }
  return candidates.sort((a, b) => b.score - a.score);
}
