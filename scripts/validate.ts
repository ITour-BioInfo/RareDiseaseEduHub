import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { recordSchema, translationSchema } from '../src/lib/catalog/schema';

const root = process.cwd();
const recordFiles = (await readdir(path.join(root, 'data', 'records')))
  .filter((file) => file.endsWith('.json'))
  .sort();
const ids = new Set<string>();
const urls = new Map<string, string[]>();
let failures = 0;

for (const file of recordFiles) {
  try {
    const record = recordSchema.parse(
      JSON.parse(await readFile(path.join(root, 'data', 'records', file), 'utf8')),
    );
    if (ids.has(record.id)) throw new Error(`Duplicate id ${record.id}`);
    if (file !== `${record.id}.json`) throw new Error(`Filename does not match id ${record.id}`);
    ids.add(record.id);
    urls.set(record.sources.canonical_url, [
      ...(urls.get(record.sources.canonical_url) || []),
      record.id,
    ]);
  } catch (error) {
    failures += 1;
    console.error(file, error);
  }
}

for (const locale of ['bg', 'en'] as const) {
  const directory = path.join(root, 'data', 'locales', locale, 'records');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    try {
      const entry = translationSchema.parse(
        JSON.parse(await readFile(path.join(directory, file), 'utf8')),
      );
      if (!ids.has(entry.record_id))
        throw new Error(`Translation references missing record ${entry.record_id}`);
      if (entry.locale !== locale) throw new Error(`Wrong locale ${entry.locale}`);
    } catch (error) {
      failures += 1;
      console.error(`${locale}/${file}`, error);
    }
  }
  if (files.length !== ids.size) {
    failures += 1;
    console.error(`${locale}: expected ${ids.size} translations, found ${files.length}`);
  }
}

const providers = YAML.parse(
  await readFile(path.join(root, 'configuration', 'providers.yml'), 'utf8'),
) as { providers?: unknown[] };
if (!Array.isArray(providers.providers) || providers.providers.length === 0) {
  failures += 1;
  console.error('Provider configuration is empty.');
}
const duplicateUrls = [...urls].filter(([, recordIds]) => recordIds.length > 1);
if (duplicateUrls.length)
  console.warn(`${duplicateUrls.length} canonical URL groups require duplicate review.`);
if (failures) process.exitCode = 1;
else console.log(`Validated ${ids.size} records and ${ids.size * 2} translations.`);
