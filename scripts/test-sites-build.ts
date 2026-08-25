import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { strict as assert } from 'node:assert';
import worker from '../sites/static-worker.js';

const client = resolve('dist/client');
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const env = {
  ASSETS: {
    async fetch(request: Request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const file = resolve(client, `.${pathname}`);
      if (file !== client && !file.startsWith(`${client}${sep}`))
        return new Response('Not found', { status: 404 });
      try {
        if (!statSync(file).isFile()) return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(readFileSync(file)), {
          headers: { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  },
};

async function fetchPath(pathname: string) {
  return worker.fetch(new Request(`https://rare-disease-edu-hub.example${pathname}`), env);
}

const root = await fetchPath('/');
assert.equal(root.status, 200);
const rootHtml = await root.text();
assert.match(rootHtml, /<html lang="bg"/u);
assert.match(rootHtml, /https:\/\/rare-disease-edu-hub\.example/u);
assert.doesNotMatch(rootHtml, /deployment\.invalid/u);

const english = await fetchPath('/en/');
assert.equal(english.status, 200);
assert.match(await english.text(), /<html lang="en"/u);

const detail = await fetchPath('/resursi/embl-ebi-training-methods-in-genomic-variant-calling/');
assert.equal(detail.status, 200);

const redirect = await fetchPath('/metodologiya');
assert.equal(redirect.status, 308);
assert.equal(
  redirect.headers.get('location'),
  'https://rare-disease-edu-hub.example/metodologiya/',
);

const missing = await fetchPath('/missing/');
assert.equal(missing.status, 404);

const socialImage = await fetchPath('/og.jpg');
assert.equal(socialImage.status, 200);
assert.equal(socialImage.headers.get('content-type'), 'image/jpeg');

const sitemap = await fetchPath('/sitemap-index.xml');
assert.equal(sitemap.status, 200);
assert.match(await sitemap.text(), /https:\/\/rare-disease-edu-hub\.example/u);

console.log(
  'Validated Sites routing for Bulgarian, English, details, redirects, 404s, and assets.',
);
