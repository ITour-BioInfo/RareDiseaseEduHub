import { describe, expect, it } from 'vitest';
import { calculateStatus, instant } from '../../src/lib/catalog/status';
import { testRecord } from '../helpers/record';

describe('status engine', () => {
  it('handles the exact event start and end boundaries', () => {
    const record = testRecord({
      dates: {
        ...testRecord().dates,
        event: {
          start: '2026-09-20T09:00:00+03:00',
          end: '2026-09-20T10:00:00+03:00',
          timezone: 'Europe/Sofia',
          precision: 'second',
        },
      },
    });
    expect(calculateStatus(record, new Date('2026-09-20T05:59:59Z')).primary).toBe(
      'upcoming-event',
    );
    expect(calculateStatus(record, new Date('2026-09-20T06:00:00Z')).primary).toBe('starts-today');
    expect(calculateStatus(record, new Date('2026-09-20T07:00:00Z')).primary).toBe('starts-today');
    expect(calculateStatus(record, new Date('2026-09-20T07:00:01Z')).primary).toBe('past-event');
  });

  it('keeps registration distinct from event dates', () => {
    const base = testRecord();
    const record = testRecord({
      dates: {
        ...base.dates,
        event: {
          start: '2026-10-01',
          end: '2026-10-03',
          timezone: 'Europe/Sofia',
          precision: 'date',
        },
        registration: { opens: '2026-08-01', closes: '2026-09-01', status_override: null },
      },
    });
    expect(calculateStatus(record, new Date('2026-08-25T09:00:00Z')).primary).toBe(
      'registration-open',
    );
    expect(calculateStatus(record, new Date('2026-09-02T09:00:00Z')).primary).toBe(
      'registration-closed-event-upcoming',
    );
  });

  it('handles availability, recurrence and lifecycle overrides', () => {
    const base = testRecord();
    expect(
      calculateStatus(
        testRecord({
          dates: { ...base.dates, availability: { opens: '2026-01-01', closes: '2026-09-01' } },
        }),
        new Date('2026-08-25T00:00:00Z'),
      ).primary,
    ).toBe('access-closes-soon');
    expect(
      calculateStatus(
        testRecord({
          classification: { ...base.classification, resource_type: 'series' },
          dates: {
            ...base.dates,
            recurrence: { rule: 'FREQ=MONTHLY', occurrences: ['2026-10-01'] },
          },
        }),
        new Date('2026-08-25T00:00:00Z'),
      ).primary,
    ).toBe('recurring-series');
    expect(calculateStatus(testRecord({ lifecycle: 'cancelled' })).primary).toBe('cancelled');
  });

  it('interprets date-only values in the source timezone across DST', () => {
    expect(instant('2026-03-29', 'Europe/Sofia')?.toISOString()).toBe('2026-03-28T22:00:00.000Z');
    expect(instant('2026-10-25', 'Europe/Sofia')?.toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(instant('2028-02-29', 'Europe/Sofia')).not.toBeNull();
  });
});
