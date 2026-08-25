import { createHash } from 'node:crypto';
import type { CatalogRecord } from '../src/lib/catalog/schema';
import { proposalSchema } from '../src/lib/catalog/schema';
import { parseFeed, parseIcs } from './feeds';
import { extractJsonLd, stripHtml } from './html-extract';
import { eventsFromJsonLd } from './structured-data';

export interface DiscoveryCandidate {
  provider: string;
  title: string;
  url: string;
  evidenceUrl: string;
  sourceKind: 'official-listing' | 'official-feed' | 'official-calendar' | 'official-sitemap';
  confidence: 'medium' | 'high';
}

const educationTerms =
  /course|training|education|webinar|workshop|school|academy|learning|event|programme|program|certificate|genetic|genomic|rare|biobank|clinical|patient|research/i;
const excludedTerms =
  /privacy|cookie|contact|about-us|newsletter|login|sign-in|terms|accessibility|donate|sponsor|social|vacanc|career|job/i;

function decode(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim();
}

export function normalizeDiscoveryUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function allowedHost(value: string, approvedDomains: string[]) {
  const hostname = new URL(value).hostname.toLowerCase();
  return approvedDomains.some((domain) => {
    const approved = domain.toLowerCase();
    return hostname === approved || hostname.endsWith(`.${approved}`);
  });
}

function fallbackTitle(value: string) {
  const path =
    new URL(value).pathname.split('/').filter(Boolean).at(-1) || 'New education resource';
  return path
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function isLikelyEducation(title: string, url: string) {
  const combined = `${title} ${new URL(url).pathname}`;
  return educationTerms.test(combined) && !excludedTerms.test(combined);
}

export function discoverFromHtml(
  html: string,
  evidenceUrl: string,
  provider: string,
  approvedDomains: string[],
) {
  const candidates: DiscoveryCandidate[] = [];
  const add = (
    titleValue: string | null,
    urlValue: string | null,
    confidence: 'medium' | 'high',
  ) => {
    if (!urlValue) return;
    const url = normalizeDiscoveryUrl(urlValue, evidenceUrl);
    if (!url || !allowedHost(url, approvedDomains)) return;
    const title = decode(stripHtml(titleValue || '')) || fallbackTitle(url);
    if (!isLikelyEducation(title, url)) return;
    candidates.push({
      provider,
      title,
      url,
      evidenceUrl,
      sourceKind: 'official-listing',
      confidence,
    });
  };

  for (const event of eventsFromJsonLd(extractJsonLd(html))) add(event.name, event.url, 'high');
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    add(match[2] || null, match[1] || null, 'medium');

  return candidates;
}

export function discoverFromSource(
  body: string,
  sourceUrl: string,
  provider: string,
  approvedDomains: string[],
  sourceKind: 'official-listing' | 'official-feed' | 'official-calendar' | 'official-sitemap',
) {
  if (sourceKind === 'official-calendar')
    return parseIcs(body)
      .map((item) => ({ title: item.title, url: item.url }))
      .flatMap(({ title, url }) => {
        const normalized = url ? normalizeDiscoveryUrl(url, sourceUrl) : null;
        if (!normalized || !allowedHost(normalized, approvedDomains)) return [];
        const resolvedTitle = title || fallbackTitle(normalized);
        if (!isLikelyEducation(resolvedTitle, normalized)) return [];
        return [
          {
            provider,
            title: resolvedTitle,
            url: normalized,
            evidenceUrl: sourceUrl,
            sourceKind,
            confidence: 'high' as const,
          },
        ];
      });

  if (sourceKind === 'official-feed')
    return parseFeed(body).flatMap((item) => {
      const normalized = item.url ? normalizeDiscoveryUrl(item.url, sourceUrl) : null;
      if (!normalized || !allowedHost(normalized, approvedDomains)) return [];
      const title = item.title || fallbackTitle(normalized);
      if (!isLikelyEducation(title, normalized)) return [];
      return [
        {
          provider,
          title,
          url: normalized,
          evidenceUrl: sourceUrl,
          sourceKind,
          confidence: 'high' as const,
        },
      ];
    });

  if (sourceKind === 'official-sitemap') {
    const urls = [...body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1] || '');
    return urls.flatMap((value) => {
      const normalized = normalizeDiscoveryUrl(decode(value), sourceUrl);
      if (!normalized || !allowedHost(normalized, approvedDomains)) return [];
      const title = fallbackTitle(normalized);
      if (!isLikelyEducation(title, normalized)) return [];
      return [
        {
          provider,
          title,
          url: normalized,
          evidenceUrl: sourceUrl,
          sourceKind,
          confidence: 'medium' as const,
        },
      ];
    });
  }

  return discoverFromHtml(body, sourceUrl, provider, approvedDomains);
}

function knownUrls(records: CatalogRecord[]) {
  const urls = new Set<string>();
  for (const record of records)
    for (const value of Object.values(record.sources)) {
      if (typeof value !== 'string' || !/^https?:/i.test(value)) continue;
      const normalized = normalizeDiscoveryUrl(value);
      if (normalized) urls.add(normalized);
    }
  return urls;
}

export function newDiscoveryCandidates(candidates: DiscoveryCandidate[], records: CatalogRecord[]) {
  const known = knownUrls(records);
  const unique = new Map<string, DiscoveryCandidate>();
  for (const candidate of candidates) {
    const normalized = normalizeDiscoveryUrl(candidate.url);
    if (!normalized || known.has(normalized) || unique.has(normalized)) continue;
    unique.set(normalized, { ...candidate, url: normalized });
  }
  return [...unique.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function slug(value: string) {
  const result = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return result || 'education-resource';
}

export function discoveryProposal(candidate: DiscoveryCandidate, checkedAt: string) {
  const hash = createHash('sha256').update(candidate.url).digest('hex').slice(0, 16);
  return proposalSchema.parse({
    proposal_id: `discovery-${hash}`,
    record_id: `new-${slug(candidate.title)}`,
    checked_at: checkedAt,
    source_url: candidate.url,
    source_kind: candidate.sourceKind,
    changes: [
      {
        field: 'content.title_original',
        old_value: null,
        proposed_value: candidate.title,
        evidence: `Title found on the official ${candidate.provider} listing.`,
        confidence: candidate.confidence,
        review_required: true,
      },
      {
        field: 'sources.official_url',
        old_value: null,
        proposed_value: candidate.url,
        evidence: `New education link found at ${candidate.evidenceUrl}`.slice(0, 240),
        confidence: candidate.confidence,
        review_required: true,
      },
    ],
  });
}
