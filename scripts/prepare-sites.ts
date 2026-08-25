import { copyFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const distribution = resolve('dist');
const client = resolve(distribution, 'client');
const server = resolve(distribution, 'server');

mkdirSync(client, { recursive: true });
for (const entry of readdirSync(distribution, { withFileTypes: true })) {
  if (entry.name === 'client' || entry.name === 'server') continue;
  renameSync(resolve(distribution, entry.name), resolve(client, entry.name));
}

mkdirSync(server, { recursive: true });
copyFileSync(resolve('sites/static-worker.js'), resolve(server, 'index.js'));

console.log('Prepared the static site for Sites hosting.');
