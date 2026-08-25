import { z } from 'zod';

export const datePrecisionSchema = z.enum(['date', 'minute', 'second', 'unknown']);
export const translationStatusSchema = z.enum(['missing', 'draft', 'reviewed', 'official']);
export const lifecycleSchema = z.enum([
  'active',
  'inactive',
  'archived',
  'retired',
  'cancelled',
  'postponed',
]);

const nullableText = z.string().trim().min(1).nullable();
const isoDateTime = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)) || /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Invalid ISO date',
  )
  .nullable();

export const recordSchema = z.object({
  schema_version: z.literal('1.0.0'),
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'IDs are stable migrated slugs; legacy trailing or repeated hyphens are retained',
    ),
  aliases: z.array(z.string()),
  lifecycle: lifecycleSchema,
  provider: z.object({
    name: z.string().min(1),
    abbreviation: nullableText,
    country: nullableText,
    official_url: z.url().nullable(),
  }),
  content: z.object({
    original_language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    title_original: z.string().min(1),
    summary_original: nullableText,
    description_original: nullableText,
  }),
  classification: z.object({
    resource_type: z.enum([
      'course',
      'workshop',
      'webinar',
      'programme',
      'exam',
      'guide',
      'recording',
      'series',
      'other',
    ]),
    delivery_modes: z.array(z.enum(['online', 'in-person', 'hybrid', 'self-paced', 'unknown'])),
    audiences: z.array(z.string()),
    topics: z.array(z.string()),
    rare_disease_scope: z.array(z.string()),
    languages: z.array(z.string()),
    certificate_kind: z.enum(['none', 'certificate', 'accreditation', 'recognition', 'unknown']),
    cost_kind: z.enum(['free', 'paid', 'mixed', 'unknown']),
  }),
  dates: z.object({
    event: z.object({
      start: isoDateTime,
      end: isoDateTime,
      timezone: nullableText,
      precision: datePrecisionSchema,
    }),
    arrival: z.object({ start: isoDateTime, end: isoDateTime, timezone: nullableText }),
    application: z.object({
      opens: isoDateTime,
      closes: isoDateTime,
      status_override: nullableText,
    }),
    registration: z.object({
      opens: isoDateTime,
      closes: isoDateTime,
      status_override: nullableText,
    }),
    availability: z.object({ opens: isoDateTime, closes: isoDateTime }),
    recurrence: z.object({ rule: nullableText, occurrences: z.array(isoDateTime.unwrap()) }),
    retired_on: isoDateTime,
    archived_on: isoDateTime,
  }),
  commercial: z.object({
    cost_kind: z.enum(['free', 'paid', 'mixed', 'unknown']),
    amount: z.number().nonnegative().nullable(),
    currency: nullableText,
  }),
  sources: z.object({
    canonical_url: z.url(),
    official_url: z.url(),
    registration_url: z.url().nullable(),
    application_url: z.url().nullable(),
    programme_url: z.url().nullable(),
    recording_url: z.url().nullable(),
    collection_url: z.url().nullable(),
    source_language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  }),
  editorial: z.object({
    verified_on: isoDateTime,
    verification_confidence: z.enum(['unverified', 'low', 'medium', 'high']),
    source_conflict: z.boolean(),
    source_conflict_note: nullableText,
    review_status: z.enum(['needs-review', 'reviewed', 'approved', 'archived']),
    notes: nullableText,
    legacy: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const translationSchema = z.object({
  record_id: z.string(),
  locale: z.enum(['bg', 'en']),
  title: nullableText,
  summary: nullableText,
  description: nullableText,
  provider_display_name: nullableText,
  translation: z.object({
    status: translationStatusSchema,
    method: nullableText,
    reviewed_by: nullableText,
    reviewed_at: isoDateTime,
    notes: nullableText,
  }),
});

export const proposalSchema = z.object({
  proposal_id: z.string().min(1),
  record_id: z.string().min(1),
  checked_at: isoDateTime.unwrap(),
  source_url: z.url(),
  source_kind: z.string().min(1),
  changes: z.array(
    z.object({
      field: z.string().min(1),
      old_value: z.unknown(),
      proposed_value: z.unknown(),
      evidence: z.string().min(1).max(240),
      confidence: z.enum(['low', 'medium', 'high']),
      review_required: z.literal(true),
    }),
  ),
});

export type CatalogRecord = z.infer<typeof recordSchema>;
export type CatalogTranslation = z.infer<typeof translationSchema>;
export type TranslationStatus = z.infer<typeof translationStatusSchema>;
