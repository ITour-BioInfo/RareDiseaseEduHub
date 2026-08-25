import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STATUS_CODES } from '../src/lib/catalog/status';

const root = process.cwd();
const bg = JSON.parse(
  await readFile(path.join(root, 'src', 'i18n', 'messages', 'bg.json'), 'utf8'),
) as Record<string, string>;
const en = JSON.parse(
  await readFile(path.join(root, 'src', 'i18n', 'messages', 'en.json'), 'utf8'),
) as Record<string, string>;
const missingBg = Object.keys(en).filter((key) => !(key in bg));
const missingEn = Object.keys(bg).filter((key) => !(key in en));
const required = [
  ...STATUS_CODES.map((code) => `status.${code}`),
  ...[
    'course',
    'workshop',
    'webinar',
    'programme',
    'exam',
    'guide',
    'recording',
    'series',
    'other',
  ].map((code) => `type.${code}`),
  ...['online', 'in-person', 'hybrid', 'self-paced', 'unknown'].map((code) => `delivery.${code}`),
];
const missingControlled = required.filter((key) => !bg[key]);
if (missingBg.length || missingEn.length || missingControlled.length) {
  console.error({ missingBg, missingEn, missingControlled });
  process.exitCode = 1;
} else console.log(`Validated ${Object.keys(bg).length} interface keys in Bulgarian and English.`);

const recordCount = (await readdir(path.join(root, 'data', 'records'))).filter((file) =>
  file.endsWith('.json'),
).length;
const bgFiles = (await readdir(path.join(root, 'data', 'locales', 'bg', 'records'))).filter(
  (file) => file.endsWith('.json'),
);
let translated = 0;
let draft = 0;
let reviewed = 0;
for (const file of bgFiles) {
  const entry = JSON.parse(
    await readFile(path.join(root, 'data', 'locales', 'bg', 'records', file), 'utf8'),
  ) as { title: string | null; translation: { status: string } };
  if (entry.title) translated += 1;
  if (entry.translation.status === 'draft') draft += 1;
  if (['reviewed', 'official'].includes(entry.translation.status)) reviewed += 1;
}
const coverage = recordCount ? ((translated / recordCount) * 100).toFixed(1) : '0.0';
const report = `# Translation coverage\n\n- Canonical records: ${recordCount}\n- Bulgarian translation records: ${bgFiles.length}\n- Bulgarian titles present: ${translated}\n- Bulgarian title coverage: ${coverage}%\n- Draft Bulgarian translations: ${draft}\n- Reviewed or official Bulgarian translations: ${reviewed}\n- Honest source-language fallback: ${recordCount - translated}\n\nInterface translation coverage is complete when the validation command passes. Resource content coverage is reported separately and missing content falls back to the original text with its source language.\n`;
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports', 'translation-coverage.md'), report);
