import type { CatalogRecord } from '../../src/lib/catalog/schema';

export function testRecord(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  const base: CatalogRecord = {
    schema_version: '1.0.0',
    id: 'test-record',
    aliases: [],
    lifecycle: 'active',
    provider: {
      name: 'Official Provider',
      abbreviation: null,
      country: null,
      official_url: 'https://official.example/',
    },
    content: {
      original_language: 'en',
      title_original: 'Official course',
      summary_original: null,
      description_original: null,
    },
    classification: {
      resource_type: 'course',
      delivery_modes: ['online'],
      audiences: [],
      topics: ['genomics'],
      rare_disease_scope: ['rare diseases'],
      languages: ['en'],
      certificate_kind: 'unknown',
      cost_kind: 'unknown',
    },
    dates: {
      event: { start: null, end: null, timezone: 'Europe/Sofia', precision: 'unknown' },
      arrival: { start: null, end: null, timezone: null },
      application: { opens: null, closes: null, status_override: null },
      registration: { opens: null, closes: null, status_override: null },
      availability: { opens: null, closes: null },
      recurrence: { rule: null, occurrences: [] },
      retired_on: null,
      archived_on: null,
    },
    commercial: { cost_kind: 'unknown', amount: null, currency: null },
    sources: {
      canonical_url: 'https://official.example/course',
      official_url: 'https://official.example/course',
      registration_url: null,
      application_url: null,
      programme_url: null,
      recording_url: null,
      collection_url: null,
      source_language: 'en',
    },
    editorial: {
      verified_on: '2026-08-24',
      verification_confidence: 'high',
      source_conflict: false,
      source_conflict_note: null,
      review_status: 'reviewed',
      notes: null,
    },
  };
  return { ...base, ...overrides };
}
