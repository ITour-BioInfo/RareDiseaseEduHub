import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';

const files = await fg([
  '**/*.{ts,js,mjs,cjs,astro,json,yml,yaml,md,css}',
  '!node_modules/**',
  '!dist/**',
  '!work/**',
  '!outputs/**',
  '!data/records/**',
  '!data/locales/**',
  '!public/rare_disease_education_catalog*',
]);
const patterns = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];
const findings: string[] = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of patterns)
    if (pattern.test(text)) findings.push(`${file}: ${pattern.source}`);
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else console.log(`Scanned ${files.length} source and documentation files for secret patterns.`);
