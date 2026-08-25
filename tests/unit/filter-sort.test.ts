import { describe, expect, it } from 'vitest';
import { matchesFilters } from '../../src/lib/catalog/filter';
import { sortRecords } from '../../src/lib/catalog/sort';
import { testRecord } from '../helpers/record';

describe('filtering and sorting', () => {
  it('matches normalized full text and controlled filters', () => {
    const record = testRecord();
    expect(
      matchesFilters(record, 'date-status-unknown', {
        query: 'GENOMICS',
        provider: 'Official Provider',
        delivery: 'online',
      }),
    ).toBe(true);
    expect(matchesFilters(record, 'date-status-unknown', { cost: 'free' })).toBe(false);
  });
  it('prioritizes open deadlines over undated records', () => {
    const base = testRecord();
    const open = testRecord({
      id: 'open',
      dates: {
        ...base.dates,
        application: { opens: '2026-08-01', closes: '2026-09-01', status_override: null },
      },
    });
    expect(sortRecords([base, open], new Date('2026-08-25T00:00:00Z'))[0]?.id).toBe('open');
  });
});
