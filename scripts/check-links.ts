import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const root = process.cwd();
const dist = path.join(root, 'dist');
const files = await fg('**/*.html', { cwd: dist, absolute: true });
const missing = new Set<string>();
for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const value = match[1] || '';
    if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:)/.test(value)) continue;
    const clean = value.split(/[?#]/)[0] || '';
    const candidate = clean.startsWith('/')
      ? path.join(dist, clean)
      : path.resolve(path.dirname(file), clean);
    const targets = path.extname(candidate)
      ? [candidate]
      : [candidate, path.join(candidate, 'index.html'), `${candidate}.html`];
    let found = false;
    for (const target of targets)
      try {
        await access(target);
        found = true;
        break;
      } catch {
        /* try next */
      }
    if (!found) missing.add(`${path.relative(dist, file)} -> ${value}`);
  }
}
if (missing.size) {
  console.error([...missing].join('\n'));
  process.exitCode = 1;
} else console.log(`Checked internal links in ${files.length} HTML files.`);
