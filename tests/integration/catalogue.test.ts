import { describe, expect, it } from 'vitest';
import { loadRecords, loadTranslations } from '../../src/lib/catalog/load';
import { duplicateCandidates } from '../../automation/deduplicate';

describe('canonical catalogue', () => {
  it('contains every approved canonical and locale record', async () => {
    const records = await loadRecords();
    expect(records).toHaveLength(179);
    expect((await loadTranslations('bg')).size).toBe(179);
    expect((await loadTranslations('en')).size).toBe(179);
  });
  it('retains official source URLs and reports duplicate candidates', async () => {
    const records = await loadRecords();
    expect(records.every((record) => record.sources.official_url.startsWith('https://'))).toBe(
      true,
    );
    expect(duplicateCandidates(records).length).toBeGreaterThan(0);
  });
});
