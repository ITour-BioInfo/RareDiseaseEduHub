import { describe, expect, it } from 'vitest';
import { proposalSchema, recordSchema, translationSchema } from '../../src/lib/catalog/schema';
import { testRecord } from '../helpers/record';

describe('catalogue schemas', () => {
  it('accepts a complete canonical record', () =>
    expect(recordSchema.parse(testRecord()).id).toBe('test-record'));
  it('rejects empty strings used as unknown values', () =>
    expect(() =>
      recordSchema.parse({ ...testRecord(), provider: { ...testRecord().provider, country: '' } }),
    ).toThrow());
  it('requires honest translation states', () =>
    expect(() =>
      translationSchema.parse({
        record_id: 'test-record',
        locale: 'bg',
        title: 'Заглавие',
        summary: null,
        description: null,
        provider_display_name: null,
        translation: {
          status: 'approved',
          method: null,
          reviewed_by: null,
          reviewed_at: null,
          notes: null,
        },
      }),
    ).toThrow());
  it('limits evidence excerpts', () =>
    expect(() =>
      proposalSchema.parse({
        proposal_id: 'p',
        record_id: 'r',
        checked_at: '2026-08-25T06:17:00+03:00',
        source_url: 'https://official.example',
        source_kind: 'official',
        changes: [
          {
            field: 'dates.event.start',
            old_value: null,
            proposed_value: '2026-09-20',
            evidence: 'x'.repeat(241),
            confidence: 'high',
            review_required: true,
          },
        ],
      }),
    ).toThrow());
});
