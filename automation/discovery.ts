import { createHash } from 'node:crypto';
import type { CatalogRecord } from '../src/lib/catalog/schema';
import { proposalSchema } from '../src/lib/catalog/schema';
import { parseFeed, parseIcs } from './feeds';
import { extractJsonLd, relevantText, stripHtml } from './html-extract';
import { eventsFromJsonLd } from './structured-data';

export interface DiscoveryCandidate {
  provider: string;
  title: string;
  url: string;
  evidenceUrl: string;
  sourceKind: 'official-listing' | 'official-feed' | 'official-calendar' | 'official-sitemap';
  confidence: 'medium' | 'high';
  language?: string;
}

export interface DiscoveryValidation {
  accepted: boolean;
  candidate: DiscoveryCandidate;
  score: number;
  reasons: string[];
  startDate: string | null;
}

export interface DiscoveryFilterResult {
  candidates: DiscoveryCandidate[];
  duplicates: number;
}

const strongEducationTerms =
  /\b(course|training|education|webinar|workshop|conference|symposium|school|academy|learning|programme|program|certificate|tutorial|lecture|masterclass|seminar|curriculum|module|recording)\b/i;
const rareDiseaseTerms =
  /\b(rare disease|rare diseases|orphan disease|genetic disorder|genetic diagnosis|clinical genetics|variant interpretation|gene therapy|inherited disorder|syndrome|anaemia|anemia|haematolog|hematolog|biobank|biobanking)\b/i;
const rareProviderTerms =
  /\b(rare|orphanet|eurordis|nord|clinical genome|clingen|ern-|eurobloodnet|vascern)\b/i;
const excludedTerms =
  /\b(privacy|cookie|contact|about us|newsletter|login|sign in|terms|accessibility|donate|sponsor|vacanc|career|job)\b/i;
const excludedPath =
  /\/(?:tag|tags|category|categories|search|subjects|about(?:-us)?|contact|privacy|terms|login|sign-in|register|registration|booking|product|expertcentres)(?:\/|$)|\/(?:quiz|quizzes)(?:\/|$)|\/wp-content\/|\.(?:pdf|docx?|pptx?|xlsx?|zip)(?:$|\?)/i;
const archivePath = /(?:archive|archives|previous-events|past-events)/i;
const secondaryContentPath =
  /\/(?:blog|news|press|stories|updates)(?:\/|$)|\/(?:highlights?|interviews?|announcements?)(?:\/|$)/i;
const secondaryContentTitle =
  /\b(applications? (?:are )?(?:open|launch(?:ed)?)|call for (?:applications?|mentors?)|highlights?|interviews?|join our talk|language offerings?|news|press release|(?:course|curriculum|programme|program|school|series) (?:is )?launch(?:ed|es)|returns? to|strengthen(?:ed|s|ing)? (?:practical )?links|looking back|recap|retrospective|reflections? on)\b/i;
const templateText = /\{\{|\}\}|data\.|_highlightResult|_snippetResult|permalink/i;
const genericTitles = new Set(
  [
    'about',
    'about us',
    'application advice',
    'back to course',
    'board',
    'book online',
    'clinical resources',
    'clinical trials',
    'collection',
    'collection challenge',
    'collection completed',
    'conferences',
    'conferences symposia',
    'core concepts',
    'course overview',
    'courses',
    'events',
    'e learning',
    'learning portal',
    'news events overview',
    'training',
    'webinars',
  ].map((value) => normalizedWords(value)),
);

function decode(value: string) {
  const numericEntity = (match: string, code: string, radix: number) => {
    const codePoint = Number.parseInt(code, radix);
    if (
      !Number.isInteger(codePoint) ||
      codePoint < 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    )
      return match;
    return String.fromCodePoint(codePoint);
  };

  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (match, code: string) => numericEntity(match, code, 10))
    .replace(/&#x([\da-f]+);/gi, (match, code: string) => numericEntity(match, code, 16))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedWords(value: string) {
  return decode(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const comparisonWords = (value: string) =>
  new Set(
    normalizedWords(value)
      .split(' ')
      .filter(
        (word) =>
          word.length > 2 &&
          ![
            'and',
            'course',
            'for',
            'from',
            'online',
            'programme',
            'program',
            'quiz',
            'the',
            'training',
            'webinar',
            'workshop',
          ].includes(word),
      ),
  );

const identityTranslations: Record<string, string> = {
  datos: 'data',
  diseases: 'disease',
  enfermedad: 'disease',
  enfermedades: 'disease',
  investigacion: 'research',
  raras: 'rare',
  raros: 'rare',
  registros: 'records',
  salud: 'health',
  sentido: 'sense',
};
const nonEnglishIdentityWords = new Set([
  'datos',
  'enfermedad',
  'enfermedades',
  'investigacion',
  'raras',
  'raros',
  'registros',
  'salud',
  'sentido',
]);

function identityWords(value: string) {
  return new Set(
    normalizedWords(value)
      .split(' ')
      .map((word) => identityTranslations[word] || word)
      .filter(
        (word) =>
          word.length > 2 &&
          ![
            'and',
            'course',
            'courses',
            'del',
            'desde',
            'disease',
            'education',
            'enfermedades',
            'for',
            'from',
            'las',
            'los',
            'making',
            'online',
            'para',
            'programme',
            'program',
            'rare',
            'sobre',
            'the',
            'training',
            'webinar',
            'workshop',
          ].includes(word),
      ),
  );
}

function wordSimilarity(left: string, right: string) {
  const a = comparisonWords(left);
  const b = comparisonWords(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(a.size, b.size);
}

function yearFrom(value: string) {
  const match = value.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function sameEdition(left: DiscoveryCandidate, right: DiscoveryCandidate) {
  const leftYear = yearFrom(`${left.title} ${left.url}`);
  const rightYear = yearFrom(`${right.title} ${right.url}`);
  return !leftYear || !rightYear || leftYear === rightYear;
}

function candidateHost(candidate: DiscoveryCandidate) {
  return new URL(candidate.url).hostname.toLowerCase().replace(/^www\./, '');
}

function overlapScore(left: DiscoveryCandidate, right: DiscoveryCandidate) {
  const a = identityWords(left.title);
  const b = identityWords(right.title);
  if (!a.size || !b.size) return { overlap: 0, similarity: 0, containment: 0 };
  const overlap = [...a].filter((word) => b.has(word)).length;
  return {
    overlap,
    similarity: overlap / Math.max(a.size, b.size),
    containment: overlap / Math.min(a.size, b.size),
  };
}

function overlappingCourse(left: DiscoveryCandidate, right: DiscoveryCandidate) {
  if (!sameEdition(left, right)) return false;
  const normalizedLeft = normalizedWords(left.title);
  const normalizedRight = normalizedWords(right.title);
  const { overlap, similarity, containment } = overlapScore(left, right);
  const sameHost = candidateHost(left) === candidateHost(right);

  if (normalizedLeft === normalizedRight && overlap >= 4) return true;
  if (sameHost && overlap >= 4 && similarity >= 0.78 && containment >= 0.8) return true;
  return overlap >= 6 && similarity >= 0.86 && containment >= 0.9;
}

function candidatePageScore(candidate: DiscoveryCandidate) {
  const path = new URL(candidate.url).pathname;
  const titleWords = normalizedWords(candidate.title).split(' ');
  let score = discoveryCandidateScore(candidate);
  if (/\/(?:courses?|education|training|webinars?|events?)\/.+/i.test(path)) score += 5;
  if (secondaryContentPath.test(path) || secondaryContentTitle.test(candidate.title)) score -= 8;
  if (archivePath.test(path)) score -= 10;
  if (path.replace(/\/+$/, '') === '') score -= 12;
  if (candidate.language?.toLowerCase().startsWith('en')) score += 3;
  else if (candidate.language) score -= 3;
  if (titleWords.some((word) => nonEnglishIdentityWords.has(word))) score -= 2;
  return score;
}

export function normalizeDiscoveryUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$|lang$|language$)/i.test(key)) url.searchParams.delete(key);
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

function meaningfulTitle(title: string) {
  const normalized = normalizedWords(title);
  return (
    normalized.length >= 8 &&
    !genericTitles.has(normalized) &&
    !templateText.test(title) &&
    !/^(?:19|20)\d{2}$/.test(normalized)
  );
}

function isLikelyEducation(title: string, url: string) {
  const parsed = new URL(url);
  const combined = `${title} ${parsed.pathname}`;
  if (!meaningfulTitle(title) || excludedTerms.test(title) || excludedPath.test(parsed.pathname))
    return false;
  return (
    strongEducationTerms.test(combined) ||
    /\/(?:courses?|training|education|webinars?|events?|products?|catalog)(?:\/|$)/i.test(
      parsed.pathname,
    )
  );
}

function contentHtml(html: string) {
  return html
    .replace(
      /<(?:header|nav|footer|aside|form|select|noscript|svg)\b[\s\S]*?<\/(?:header|nav|footer|aside|form|select|noscript|svg)>/gi,
      ' ',
    )
    .replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, ' ');
}

function pageTitle(html: string) {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return decode(stripHtml(heading || title || ''));
}

function pageLanguage(html: string) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1]?.trim() || null;
}

function canonicalUrl(html: string, base: string) {
  const baseHost = new URL(base).hostname.toLowerCase().replace(/^www\./, '');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)];
  for (const [tag] of links) {
    if (!/\brel=["'][^"']*canonical[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const normalized = href ? normalizeDiscoveryUrl(href, base) : null;
    if (normalized && new URL(normalized).hostname.toLowerCase().replace(/^www\./, '') === baseHost)
      return normalized;
  }
  return normalizeDiscoveryUrl(base) || base;
}

export function isCollectionListingUrl(value: string) {
  const url = new URL(value);
  if (archivePath.test(url.pathname)) return false;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return true;
  return /\/(?:all-courses|catalog|courses|education|education-training|education-training-news|events|learning-portal|materials|online-courses|open-academy-schools|rare-disease-courses|rare-disease-education-hub|schools|training|training-and-education|webinars)$/i.test(
    path,
  );
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
  for (const match of contentHtml(html).matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  ))
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

function recordUrls(records: CatalogRecord[]) {
  const urls = new Set<string>();
  for (const record of records)
    for (const value of Object.values(record.sources)) {
      if (typeof value !== 'string' || !/^https?:/i.test(value)) continue;
      const normalized = normalizeDiscoveryUrl(value);
      if (normalized) urls.add(normalized);
    }
  return urls;
}

function sameTitleAndProvider(candidate: DiscoveryCandidate, record: CatalogRecord) {
  const candidateYear = yearFrom(`${candidate.title} ${candidate.url}`);
  const recordYear = yearFrom(
    `${record.content.title_original} ${record.sources.official_url} ${record.dates.event.start || ''}`,
  );
  if (candidateYear && recordYear && candidateYear !== recordYear) return false;
  const titleScore = wordSimilarity(candidate.title, record.content.title_original);
  const providerScore = wordSimilarity(candidate.provider, record.provider.name);
  return titleScore >= 0.82 && providerScore >= 0.5;
}

export function filterNewDiscoveryCandidates(
  candidates: DiscoveryCandidate[],
  records: CatalogRecord[],
): DiscoveryFilterResult {
  const known = recordUrls(records);
  const uniqueUrls = new Map<string, DiscoveryCandidate>();
  const uniqueSignatures = new Set<string>();
  let duplicates = 0;
  for (const candidate of candidates) {
    const normalized = normalizeDiscoveryUrl(candidate.url);
    const edition = yearFrom(`${candidate.title} ${candidate.url}`) || 'undated';
    const signature = `${normalizedWords(candidate.title)}|${normalizedWords(candidate.provider)}|${edition}`;
    if (
      !normalized ||
      known.has(normalized) ||
      uniqueUrls.has(normalized) ||
      uniqueSignatures.has(signature) ||
      records.some((record) => sameTitleAndProvider(candidate, record))
    ) {
      duplicates += 1;
      continue;
    }
    uniqueUrls.set(normalized, { ...candidate, url: normalized });
    uniqueSignatures.add(signature);
  }
  return {
    candidates: [...uniqueUrls.values()].sort(
      (a, b) =>
        discoveryCandidateScore(b) - discoveryCandidateScore(a) || a.title.localeCompare(b.title),
    ),
    duplicates,
  };
}

/**
 * Runs after official detail pages have been validated. At that point titles and
 * canonical URLs are reliable enough to collapse cross-posts, locale variants and
 * alternate provider pages without merging short, generic course names.
 */
export function consolidateDiscoveryCandidates(
  candidates: DiscoveryCandidate[],
  records: CatalogRecord[],
): DiscoveryFilterResult {
  const preliminary = filterNewDiscoveryCandidates(candidates, records);
  const existing = records.map((record): DiscoveryCandidate => ({
    provider: record.provider.name,
    title: record.content.title_original,
    url: record.sources.official_url,
    evidenceUrl: record.sources.official_url,
    sourceKind: 'official-listing',
    confidence: 'high',
  }));
  const selected: DiscoveryCandidate[] = [];
  let duplicates = preliminary.duplicates;

  for (const candidate of [...preliminary.candidates].sort(
    (a, b) =>
      candidatePageScore(b) - candidatePageScore(a) ||
      a.url.localeCompare(b.url) ||
      a.title.localeCompare(b.title),
  )) {
    if (
      existing.some((record) => overlappingCourse(candidate, record)) ||
      selected.some((other) => overlappingCourse(candidate, other))
    ) {
      duplicates += 1;
      continue;
    }
    selected.push(candidate);
  }

  return {
    candidates: selected.sort(
      (a, b) =>
        discoveryCandidateScore(b) - discoveryCandidateScore(a) || a.title.localeCompare(b.title),
    ),
    duplicates,
  };
}

export function newDiscoveryCandidates(candidates: DiscoveryCandidate[], records: CatalogRecord[]) {
  return filterNewDiscoveryCandidates(candidates, records).candidates;
}

export function discoveryCandidateScore(candidate: DiscoveryCandidate) {
  let score = candidate.confidence === 'high' ? 4 : 0;
  if (strongEducationTerms.test(candidate.title)) score += 3;
  if (rareDiseaseTerms.test(`${candidate.title} ${candidate.url}`)) score += 3;
  if (/\b(rare|genetic|genomic|clingen|ern|eurordis|nord|orphanet)\b/i.test(candidate.provider))
    score += 2;
  if (/\b20(?:2[6-9]|3\d)\b/.test(`${candidate.title} ${candidate.url}`)) score += 2;
  if (
    /\/(?:courses?|training|education|webinars?|events?|products?)(?:\/|$)/i.test(
      new URL(candidate.url).pathname,
    )
  )
    score += 1;
  return score;
}

export function validateDiscoveryCandidate(
  candidate: DiscoveryCandidate,
  html: string,
  finalUrl: string,
  now = Date.now(),
): DiscoveryValidation {
  const reasons: string[] = [];
  const events = eventsFromJsonLd(extractJsonLd(html));
  const structured = events.find((event) => event.name || event.url);
  const resolvedTitle = decode(structured?.name || pageTitle(html) || candidate.title);
  const resolvedUrl = canonicalUrl(html, finalUrl);
  const language = pageLanguage(html);
  const text = relevantText(contentHtml(html));
  const educationEvidence =
    strongEducationTerms.test(`${resolvedTitle} ${text}`) ||
    ['Course', 'CourseInstance'].includes(structured?.type || '');
  const relevanceEvidence =
    rareDiseaseTerms.test(`${resolvedTitle} ${text}`) || rareProviderTerms.test(candidate.provider);
  const evergreen =
    /\b(on demand|on-demand|self paced|self-paced|online available|register|recording|watch on youtube|e-learning)\b/i.test(
      text,
    );
  const startDate = structured?.start || null;
  const startTime = startDate ? Date.parse(startDate) : Number.NaN;
  const staleEvent = Number.isFinite(startTime) && startTime < now - 180 * 86_400_000;
  const resolvedPath = new URL(resolvedUrl).pathname;
  const structuredCourse = ['Course', 'CourseInstance'].includes(structured?.type || '');
  const currentStructuredEvent = structured?.type === 'Event' && !!startDate && !staleEvent;
  const secondaryPage =
    secondaryContentPath.test(resolvedPath) ||
    secondaryContentTitle.test(resolvedTitle) ||
    secondaryContentTitle.test(candidate.title);
  const resolvedYear = yearFrom(`${resolvedTitle} ${resolvedUrl}`);
  const currentYear = new Date(now).getUTCFullYear();
  let score = 0;

  if (!meaningfulTitle(resolvedTitle)) reasons.push('generic or templated title');
  else score += 1;
  if (excludedPath.test(new URL(resolvedUrl).pathname))
    reasons.push('navigation, quiz or download URL');
  if (resolvedPath.replace(/\/+$/, '') === '' && !structuredCourse && !currentStructuredEvent)
    reasons.push('provider homepage rather than a course page');
  if (archivePath.test(resolvedPath) && !structuredCourse && !currentStructuredEvent)
    reasons.push('archive or collection page rather than a course page');
  if (secondaryPage && !structuredCourse && !currentStructuredEvent)
    reasons.push('announcement or supporting page rather than a course page');
  if (
    resolvedYear &&
    resolvedYear < currentYear - 2 &&
    !structuredCourse &&
    !currentStructuredEvent &&
    !evergreen
  )
    reasons.push('historical page without current or on-demand learning evidence');
  if (/\b(log in to the site|page not found|404)\b/i.test(`${resolvedTitle} ${text.slice(0, 500)}`))
    reasons.push('login or missing page');
  if (!educationEvidence) reasons.push('no course or learning evidence');
  else score += strongEducationTerms.test(resolvedTitle) ? 2 : 1;
  if (!relevanceEvidence) reasons.push('no rare-disease or clinical-genetics relevance');
  else score += 3;
  if (structured) score += 3;
  if (startDate && !staleEvent) score += 2;
  if (evergreen) score += 1;
  if (candidate.confidence === 'high') score += 1;
  if (staleEvent) reasons.push('event is more than 180 days old');

  return {
    accepted: reasons.length === 0 && score >= 5,
    candidate: {
      ...candidate,
      title: resolvedTitle,
      url: resolvedUrl,
      ...(language ? { language } : {}),
    },
    score,
    reasons,
    startDate,
  };
}

function slug(value: string) {
  const result = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return result || 'education-resource';
}

export function discoveryProposal(candidate: DiscoveryCandidate, checkedAt: string) {
  const hash = createHash('sha256').update(candidate.url).digest('hex').slice(0, 16);
  return proposalSchema.parse({
    proposal_id: `discovery-${hash}`,
    record_id: `new-${slug(candidate.title)}-${hash.slice(0, 8)}`,
    checked_at: checkedAt,
    source_url: candidate.url,
    source_kind: candidate.sourceKind,
    changes: [
      {
        field: 'content.title_original',
        old_value: null,
        proposed_value: candidate.title,
        evidence: `Title verified on the official ${candidate.provider} page.`,
        confidence: candidate.confidence,
        review_required: true,
      },
      {
        field: 'sources.official_url',
        old_value: null,
        proposed_value: candidate.url,
        evidence:
          `Education link found at ${candidate.evidenceUrl} and verified on its official page.`.slice(
            0,
            240,
          ),
        confidence: candidate.confidence,
        review_required: true,
      },
    ],
  });
}
