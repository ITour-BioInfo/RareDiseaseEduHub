import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecords, loadTranslations } from '../src/lib/catalog/load';
import { localizeRecord } from '../src/lib/catalog/localization';
import { calculateStatus } from '../src/lib/catalog/status';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const messages = JSON.parse(
  await readFile(path.join(root, 'src', 'i18n', 'messages', 'bg.json'), 'utf8'),
) as Record<string, string>;
const now = process.env.CATALOG_NOW ? new Date(process.env.CATALOG_NOW) : new Date();

function csvCell(value: unknown) {
  const text = value == null ? '' : Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function createExports() {
  const records = await loadRecords();
  const bg = await loadTranslations('bg');
  const en = await loadTranslations('en');
  const rows = records.map((record) => {
    const localized = localizeRecord(record, bg.get(record.id));
    const status = calculateStatus(record, now);
    return {
      id: record.id,
      title_bg: localized.has_translation ? localized.display_title : '',
      title_original: record.content.title_original,
      source_language: record.content.original_language,
      provider: record.provider.name,
      resource_type: record.classification.resource_type,
      event_start: record.dates.event.start,
      event_end: record.dates.event.end,
      event_timezone: record.dates.event.timezone,
      application_open: record.dates.application.opens,
      application_close: record.dates.application.closes,
      registration_open: record.dates.registration.opens,
      registration_close: record.dates.registration.closes,
      availability_open: record.dates.availability.opens,
      availability_close: record.dates.availability.closes,
      primary_status_bg: messages[`status.${status.primary}`] || status.primary,
      primary_status_code: status.primary,
      official_url: record.sources.official_url,
      verified_on: record.editorial.verified_on,
      translation_status_bg: bg.get(record.id)?.translation.status || 'missing',
      source_collection_url: record.sources.collection_url,
      delivery: record.classification.delivery_modes,
      topics: record.classification.topics,
      next_action_at: status.next_action_at,
    };
  });
  const headers = Object.keys(rows[0] || {});
  const csv = `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvCell((row as any)[header])).join(',')).join('\n')}\n`;
  const enRows = records.map((record) => ({
    id: record.id,
    title: localizeRecord(record, en.get(record.id)).display_title,
    provider: record.provider.name,
    resource_type: record.classification.resource_type,
    primary_status_code: calculateStatus(record, now).primary,
    official_url: record.sources.official_url,
    verified_on: record.editorial.verified_on,
  }));
  const enHeaders = Object.keys(enRows[0] || {});
  const enCsv = `${enHeaders.join(',')}\n${enRows.map((row) => enHeaders.map((header) => csvCell((row as any)[header])).join(',')).join('\n')}\n`;
  return { json: `${JSON.stringify(rows, null, 2)}\n`, csv, enCsv };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exports = await createExports();
  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, 'rare_disease_education_catalog.json'), exports.json),
    writeFile(path.join(publicDir, 'rare_disease_education_catalog.csv'), exports.csv),
    writeFile(path.join(publicDir, 'rare_disease_education_catalog.en.csv'), exports.enCsv),
  ]);
  console.log('Generated JSON and CSV exports.');
}
