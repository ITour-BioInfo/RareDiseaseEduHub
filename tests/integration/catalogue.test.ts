import { describe, expect, it } from 'vitest';
import { loadRecords, loadTranslations } from '../../src/lib/catalog/load';
import { duplicateCandidates } from '../../automation/deduplicate';

describe('migrated catalogue', () => {
  it('contains every migrated record and locale record', async () => {
    const records = await loadRecords();
    expect(records).toHaveLength(180);
    expect((await loadTranslations('bg')).size).toBe(180);
    expect((await loadTranslations('en')).size).toBe(180);
  });
  it('retains official source URLs and reports duplicate candidates', async () => {
    const records = await loadRecords();
    expect(records.every((record) => record.sources.official_url.startsWith('https://'))).toBe(
      true,
    );
    expect(duplicateCandidates(records).length).toBeGreaterThan(0);
  });
});
