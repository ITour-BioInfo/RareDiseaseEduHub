import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  recordSchema,
  translationSchema,
  type CatalogRecord,
  type CatalogTranslation,
} from '../src/lib/catalog/schema';

interface LegacyRecord {
  id: string;
  title: string;
  provider: string;
  type_group: string;
  date_status: string;
  date_status_bg: string;
  sort_date: string;
  dates: string;
  delivery: string;
  duration: string;
  cost: string;
  certificate_or_recognition: string;
  rare_disease_scope: string;
  official_url: string;
  source_collection_url: string;
  url_type: string;
  notes: string;
  tags: string;
  source_status_note: string;
  original_record_type: string;
  catalogue_index: number | null;
  verified_on: string;
  [key: string]: unknown;
}

const root = process.cwd();
const source = process.argv[2] || path.join(root, 'work', 'source', 'catalog.json');
const recordsDir = path.join(root, 'data', 'records');
const bgDir = path.join(root, 'data', 'locales', 'bg', 'records');
const enDir = path.join(root, 'data', 'locales', 'en', 'records');

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const list = (value: unknown) =>
  typeof value === 'string'
    ? value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
const isDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

function resourceType(value: string): CatalogRecord['classification']['resource_type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('workshop') || normalized.includes('summer-school')) return 'workshop';
  if (normalized.includes('webinar')) return 'webinar';
  if (normalized.includes('exam')) return 'exam';
  if (normalized.includes('guide') || normalized.includes('toolkit')) return 'guide';
  if (normalized.includes('recording')) return 'recording';
  if (normalized.includes('series')) return 'series';
  if (normalized.includes('programme') || normalized.includes('program')) return 'programme';
  if (
    normalized.includes('course') ||
    normalized.includes('mooc') ||
    normalized.includes('training')
  )
    return 'course';
  return 'other';
}

function deliveryModes(value: string): CatalogRecord['classification']['delivery_modes'] {
  const normalized = value.toLowerCase();
  const modes: CatalogRecord['classification']['delivery_modes'] = [];
  if (/self.?paced|on.?demand|asynchronous/.test(normalized)) modes.push('self-paced');
  if (/online|virtual|remote/.test(normalized)) modes.push('online');
  if (/in.?person|onsite|on-site|face.?to.?face/.test(normalized)) modes.push('in-person');
  if (/hybrid|blended/.test(normalized)) modes.push('hybrid');
  return modes.length ? [...new Set(modes)] : ['unknown'];
}

function rootUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/`;
  } catch {
    return null;
  }
}

function migrate(legacy: LegacyRecord): CatalogRecord {
  const start =
    ['past', 'upcoming'].includes(legacy.date_status) && isDate(legacy.sort_date)
      ? legacy.sort_date
      : null;
  const delivery = legacy.delivery || '';
  const cost = legacy.cost || '';
  const recognition = legacy.certificate_or_recognition || '';
  return recordSchema.parse({
    schema_version: '1.0.0',
    id: legacy.id,
    aliases: [],
    lifecycle: 'active',
    provider: {
      name: legacy.provider,
      abbreviation: null,
      country: null,
      official_url: rootUrl(legacy.official_url),
    },
    content: {
      original_language: 'en',
      title_original: legacy.title,
      summary_original: text(legacy.rare_disease_scope),
      description_original: text(legacy.notes),
    },
    classification: {
      resource_type: resourceType(legacy.type_group || legacy.original_record_type || ''),
      delivery_modes: deliveryModes(delivery),
      audiences: [],
      topics: list(legacy.tags),
      rare_disease_scope: list(legacy.rare_disease_scope),
      languages: ['en'],
      certificate_kind: /accredit/i.test(recognition)
        ? 'accreditation'
        : /certificate/i.test(recognition)
          ? 'certificate'
          : /recognition/i.test(recognition)
            ? 'recognition'
            : recognition
              ? 'unknown'
              : 'none',
      cost_kind: /free|безплат/i.test(cost)
        ? 'free'
        : /paid|fee|€|\$|£/.test(cost)
          ? 'paid'
          : 'unknown',
    },
    dates: {
      event: {
        start,
        end: null,
        timezone: start ? 'Europe/Sofia' : null,
        precision: start ? 'date' : 'unknown',
      },
      arrival: { start: null, end: null, timezone: null },
      application: { opens: null, closes: null, status_override: null },
      registration: { opens: null, closes: null, status_override: null },
      availability: { opens: null, closes: null },
      recurrence: { rule: null, occurrences: [] },
      retired_on: null,
      archived_on: null,
    },
    commercial: {
      cost_kind: /free|безплат/i.test(cost)
        ? 'free'
        : /paid|fee|€|\$|£/.test(cost)
          ? 'paid'
          : 'unknown',
      amount: null,
      currency: null,
    },
    sources: {
      canonical_url: legacy.official_url,
      official_url: legacy.official_url,
      registration_url: null,
      application_url: null,
      programme_url: null,
      recording_url: null,
      collection_url: text(legacy.source_collection_url),
      source_language: 'en',
    },
    editorial: {
      verified_on: text(legacy.verified_on),
      verification_confidence: 'unverified',
      source_conflict: false,
      source_conflict_note: null,
      review_status: 'needs-review',
      notes: text(
        [
          legacy.dates && `Legacy date text: ${legacy.dates}`,
          legacy.source_status_note,
          legacy.notes,
        ]
          .filter(Boolean)
          .join(' | '),
      ),
      legacy: Object.fromEntries(
        Object.entries(legacy).filter(
          ([key]) => !['id', 'title', 'provider', 'official_url'].includes(key),
        ),
      ),
    },
  });
}

function translation(record: CatalogRecord, locale: 'bg' | 'en'): CatalogTranslation {
  const isOriginal = record.content.original_language === locale;
  return translationSchema.parse({
    record_id: record.id,
    locale,
    title: isOriginal ? record.content.title_original : null,
    summary: isOriginal ? record.content.summary_original : null,
    description: isOriginal ? record.content.description_original : null,
    provider_display_name: null,
    translation: {
      status: isOriginal ? 'official' : 'missing',
      method: null,
      reviewed_by: null,
      reviewed_at: null,
      notes: isOriginal
        ? 'Original source-language content.'
        : 'Bulgarian editorial translation required.',
    },
  });
}

await Promise.all(
  [recordsDir, bgDir, enDir, path.join(root, 'configuration'), path.join(root, 'reports')].map(
    (directory) => mkdir(directory, { recursive: true }),
  ),
);
const legacy = JSON.parse(await readFile(source, 'utf8')) as LegacyRecord[];
const records = legacy.map(migrate).sort((a, b) => a.id.localeCompare(b.id));

for (const record of records) {
  await Promise.all([
    writeFile(path.join(recordsDir, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`),
    writeFile(
      path.join(bgDir, `${record.id}.json`),
      `${JSON.stringify(translation(record, 'bg'), null, 2)}\n`,
    ),
    writeFile(
      path.join(enDir, `${record.id}.json`),
      `${JSON.stringify(translation(record, 'en'), null, 2)}\n`,
    ),
  ]);
}

const providers = [...new Set(records.map((record) => record.provider.name))].sort().map((name) => {
  const providerRecords = records.filter((record) => record.provider.name === name);
  const approvedDomains = [
    ...new Set(providerRecords.map((record) => new URL(record.sources.official_url).hostname)),
  ].sort();
  const collections = [
    ...new Set(providerRecords.map((record) => record.sources.collection_url).filter(Boolean)),
  ].sort();
  return {
    name,
    approved_domains: approvedDomains,
    official_collection_pages: collections,
    sitemaps: [],
    feeds: [],
    check_cadence: 'weekly',
    priority_window_days: 60,
    request_delay_ms: 1200,
    maximum_concurrency: 1,
    javascript_rendering_required: false,
    current_page_paths: [],
    archive_paths: [],
    selectors: { title: null, date: null, registration: null, application: null, access: null },
    enabled: true,
    notes: 'Migrated provider; selectors require editorial verification.',
  };
});
await writeFile(
  path.join(root, 'configuration', 'providers.yml'),
  YAML.stringify({ schema_version: '1.0.0', providers }),
);

const withStructuredStart = records.filter((record) => record.dates.event.start).length;
const report = `# Catalogue migration report\n\n- Records imported: ${records.length}\n- Records merged: 0\n- Aliases created: 0\n- Dates parsed confidently from legacy sort dates: ${withStructuredStart}\n- Dates left unparsed or unavailable: ${records.length - withStructuredStart}\n- Records requiring source verification: ${records.length}\n- English original-content records: ${records.length}\n- Bulgarian resource translations present: 0\n- Bulgarian resource translations missing: ${records.length}\n\nThe legacy date text, status, type, index, verification notes, delivery, cost, recognition and source status are retained under each record's editorial migration metadata. No missing years or date roles were inferred.\n`;
await writeFile(path.join(root, 'reports', 'migration-report.md'), report);
console.log(`Migrated ${records.length} records.`);
