import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  recordSchema,
  translationSchema,
  type CatalogRecord,
  type CatalogTranslation,
} from './schema';

const root = process.cwd();

export async function loadRecords(): Promise<CatalogRecord[]> {
  const directory = path.join(root, 'data', 'records');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) =>
      recordSchema.parse(JSON.parse(await readFile(path.join(directory, file), 'utf8'))),
    ),
  );
}

export async function loadTranslations(
  locale: 'bg' | 'en',
): Promise<Map<string, CatalogTranslation>> {
  const directory = path.join(root, 'data', 'locales', locale, 'records');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const entries = await Promise.all(
    files.map(async (file) =>
      translationSchema.parse(JSON.parse(await readFile(path.join(directory, file), 'utf8'))),
    ),
  );
  return new Map(entries.map((entry) => [entry.record_id, entry]));
}
