import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const distDirectory = resolve('dist');
const hostArgument = process.argv.indexOf('--host');
const host = hostArgument >= 0 ? process.argv[hostArgument + 1] : '127.0.0.1';
const port = Number(process.env.PORT ?? 4321);

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolveRequestPath(pathname: string): string | undefined {
  const decodedPath = decodeURIComponent(pathname);
  const candidate = resolve(distDirectory, `.${decodedPath}`);
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${sep}`)) return;

  const attempts = [candidate];
  if (decodedPath.endsWith('/')) attempts.unshift(resolve(candidate, 'index.html'));
  if (!extname(decodedPath)) {
    attempts.push(resolve(candidate, 'index.html'), `${candidate}.html`);
  }

  return attempts.find((attempt) => existsSync(attempt) && statSync(attempt).isFile());
}

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    const requestedFile = resolveRequestPath(requestUrl.pathname);
    const file = requestedFile ?? resolve(distDirectory, '404.html');
    const status = requestedFile ? 200 : 404;

    response.writeHead(status, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
});

server.listen(port, host, () => {
  console.log(`Preview server listening on http://${host}:${port}`);
});
