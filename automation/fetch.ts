import { lookup } from 'node:dns/promises';
import { validateSourceUrl, isPrivateAddress } from './network-security';

export interface FetchOptions {
  approvedDomains?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  contact?: string;
  etag?: string;
  lastModified?: string;
}
export interface FetchResult {
  status: number;
  body: string;
  finalUrl: string;
  redirects: string[];
  etag: string | null;
  lastModified: string | null;
}

async function publicUrl(value: string, approvedDomains: string[]) {
  const url = validateSourceUrl(value, approvedDomains);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address)))
    throw new Error('DNS resolved to a private or non-public destination.');
  return url;
}

export async function fetchSource(value: string, options: FetchOptions = {}): Promise<FetchResult> {
  const approvedDomains = options.approvedDomains || [];
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 2_000_000;
  let url = await publicUrl(value, approvedDomains);
  const redirects: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': `${options.userAgent || 'RareDiseaseEducationCatalogueBot/1.0'}${options.contact ? ` (${options.contact})` : ''}`,
          Accept:
            'text/html,application/ld+json,application/json,application/xml,text/calendar,text/plain;q=0.8',
          ...(options.etag ? { 'If-None-Match': options.etag } : {}),
          ...(options.lastModified ? { 'If-Modified-Since': options.lastModified } : {}),
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects.length >= maxRedirects) throw new Error('Redirect limit exceeded.');
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect is missing a location.');
        url = await publicUrl(new URL(location, url).toString(), approvedDomains);
        redirects.push(url.toString());
        attempt -= 1;
        continue;
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(4000, 400 * 2 ** attempt + Math.random() * 250)),
        );
        continue;
      }
      const size = Number(response.headers.get('content-length') || 0);
      if (size > maxBytes) throw new Error('Response exceeds maximum configured size.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error('Response exceeds maximum configured size.');
      return {
        status: response.status,
        body: new TextDecoder().decode(bytes),
        finalUrl: url.toString(),
        redirects,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Source fetch failed after bounded retries.');
}
