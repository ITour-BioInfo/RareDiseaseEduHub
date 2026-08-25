import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createExports } from './export';

const root = process.cwd();
const expected = await createExports();
const targets = [
  ['rare_disease_education_catalog.json', expected.json],
  ['rare_disease_education_catalog.csv', expected.csv],
  ['rare_disease_education_catalog.en.csv', expected.enCsv],
] as const;
let stale = false;
for (const [name, generated] of targets) {
  const actual = await readFile(path.join(root, 'public', name), 'utf8');
  if (actual !== generated) {
    stale = true;
    console.error(`${name} is stale.`);
  }
}
if (stale) process.exitCode = 1;
else console.log('Generated exports are current.');
