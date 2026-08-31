import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractJsonLd, relevantText } from '../../automation/html-extract';
import { parseFeed, parseIcs } from '../../automation/feeds';
import { eventsFromJsonLd } from '../../automation/structured-data';
import {
  consolidateDiscoveryCandidates,
  discoverFromHtml,
  discoveryProposal,
  filterNewDiscoveryCandidates,
  isCollectionListingUrl,
  validateDiscoveryCandidate,
  type DiscoveryCandidate,
} from '../../automation/discovery';
import { knownRecordChangeProposal } from '../../automation/known-records';
import { parseRobots, robotsAllows } from '../../automation/robots';
import { loadRecords } from '../../src/lib/catalog/load';

const fixture = (name: string) =>
  readFile(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf8');
describe('crawler fixtures', () => {
  it('extracts JSON-LD Event, Course and CourseInstance data', async () => {
    const html = await fixture('provider-listing.html');
    expect(eventsFromJsonLd(extractJsonLd(html))[0]?.name).toBe('Official course');
    expect(eventsFromJsonLd([JSON.parse(await fixture('event.jsonld'))])[0]?.start).toContain(
      '2026-09-20',
    );
    expect(eventsFromJsonLd([JSON.parse(await fixture('course.jsonld'))])[0]?.type).toBe('Course');
  });
  it('turns new official education links into human-review proposals', () => {
    const candidates = discoverFromHtml(
      `<main><a href="/courses/new-rare-disease-course">New rare disease course</a><a href="/privacy">Privacy</a></main>`,
      'https://official.example/education/',
      'Official provider',
      ['official.example'],
    );
    expect(candidates).toHaveLength(1);
    expect(
      discoveryProposal(candidates[0]!, '2026-08-25T10:00:00.000Z').changes[0]?.review_required,
    ).toBe(true);
  });
  it('mines collection content while rejecting navigation, templates and generic categories', () => {
    const candidates = discoverFromHtml(
      `<nav>
        <a href="/subjects/creative-arts-and-media-courses/cooking">Cooking</a>
        <a href="/courses">Courses</a>
      </nav>
      <main>
        <a href="/{{ data.permalink }}">{{ data._highlightResult.post_title.value }}</a>
        <a href="/courses/new-rare-disease-course">New rare disease course</a>
      </main>`,
      'https://official.example/education/',
      'Official rare-disease provider',
      ['official.example'],
    );
    expect(candidates.map((candidate) => candidate.title)).toEqual(['New rare disease course']);
  });
  it('distinguishes collection pages from detail pages and archives', () => {
    expect(isCollectionListingUrl('https://official.example/courses/')).toBe(true);
    expect(isCollectionListingUrl('https://openacademy.eurordis.org/all-courses/')).toBe(true);
    expect(isCollectionListingUrl('https://openacademy.eurordis.org/open-academy-schools/')).toBe(
      true,
    );
    expect(isCollectionListingUrl('https://official.example/rare-disease-education-hub/')).toBe(
      true,
    );
    expect(isCollectionListingUrl('https://official.example/courses/specific-course/')).toBe(false);
    expect(isCollectionListingUrl('https://official.example/previous-events/')).toBe(false);
  });
  it('leaves invalid numeric entities inert instead of aborting discovery', () => {
    const candidates = discoverFromHtml(
      `<main><a href="/courses/rare-disease-course">&#999999999; &#xD800; Rare disease course</a></main>`,
      'https://official.example/courses/',
      'Official rare-disease provider',
      ['official.example'],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.title).toContain('&#999999999;');
    expect(candidates[0]?.title).toContain('&#xD800;');
  });
  it('requires official-page learning and rare-disease evidence', () => {
    const candidate: DiscoveryCandidate = {
      provider: 'American Society of Human Genetics (ASHG)',
      title: 'AI-Powered Genetic Research Through MARRVEL-MCP',
      url: 'https://learning.ashg.org/products/marrvel-mcp',
      evidenceUrl: 'https://learning.ashg.org/catalog',
      sourceKind: 'official-listing',
      confidence: 'medium',
    };
    const accepted = validateDiscoveryCandidate(
      candidate,
      `<html><head><title>AI-Powered Genetic Research Through MARRVEL-MCP</title></head>
        <body><main><h1>AI-Powered Genetic Research Through MARRVEL-MCP</h1>
        <p>Register for this webinar about variant interpretation and rare disease diagnosis.</p>
        </main></body></html>`,
      candidate.url,
      Date.parse('2026-08-26T00:00:00Z'),
    );
    expect(accepted.accepted).toBe(true);

    const unrelated = validateDiscoveryCandidate(
      { ...candidate, provider: 'Wellcome Connecting Science', title: 'COG-Train Programme' },
      `<main><h1>COG-Train Programme</h1><p>Training in SARS-CoV-2 pathogen genomics.</p></main>`,
      'https://official.example/cog-train',
      Date.parse('2026-08-26T00:00:00Z'),
    );
    expect(unrelated.accepted).toBe(false);
    expect(unrelated.reasons).toContain('no rare-disease or clinical-genetics relevance');

    const consortiumMeeting = validateDiscoveryCandidate(
      {
        ...candidate,
        provider: 'EDITSCD / ERN-EuroBloodNet',
        title: 'Annual meeting 2026 in-person',
      },
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Event',
        name: 'Annual meeting 2026 in-person',
        startDate: '2026-09-08T09:00:00Z',
      })}</script><main><h1>Annual meeting 2026 in-person</h1><p>The consortium will meet to debrief.</p></main>`,
      'https://editscd.eu/events/annual-meeting-2026-in-person',
      Date.parse('2026-08-26T00:00:00Z'),
    );
    expect(consortiumMeeting.accepted).toBe(false);
    expect(consortiumMeeting.reasons).toContain('no course or learning evidence');
  });
  it('rejects stale events even when their pages still contain recordings', () => {
    const candidate: DiscoveryCandidate = {
      provider: 'BBMRI-ERIC',
      title: 'Webinar: old ethics event',
      url: 'https://www.bbmri-eric.eu/events/old-ethics-event',
      evidenceUrl: 'https://www.bbmri-eric.eu/events',
      sourceKind: 'official-listing',
      confidence: 'high',
    };
    const validation = validateDiscoveryCandidate(
      candidate,
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Event',
        name: candidate.title,
        startDate: '2021-09-13T14:00:00Z',
        url: candidate.url,
      })}</script><main><h1>${candidate.title}</h1><p>Rare disease webinar recording.</p></main>`,
      candidate.url,
      Date.parse('2026-08-26T00:00:00Z'),
    );
    expect(validation.accepted).toBe(false);
    expect(validation.reasons).toContain('event is more than 180 days old');
  });
  it('deduplicates alternate URLs using title, provider and event year', async () => {
    const records = await loadRecords();
    const existing = records.find(
      (record) => record.content.title_original === '9th Eye Genetics Course',
    );
    expect(existing).toBeTruthy();
    const result = filterNewDiscoveryCandidates(
      [
        {
          provider: existing!.provider.name,
          title: existing!.content.title_original,
          url: `${existing!.sources.official_url}?lang=en`,
          evidenceUrl: existing!.sources.official_url,
          sourceKind: 'official-listing',
          confidence: 'medium',
        },
      ],
      records,
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.duplicates).toBe(1);
  });
  it('consolidates verified cross-posts and keeps the direct course page', () => {
    const title =
      'Open Academy schools in Barcelona strengthen practical links between patient advocacy and rare disease research';
    const result = consolidateDiscoveryCandidates(
      [
        {
          provider: 'ERDERA',
          title,
          url: 'https://erdera.example/news/open-academy-schools-in-barcelona',
          evidenceUrl: 'https://erdera.example/news',
          sourceKind: 'official-listing',
          confidence: 'high',
        },
        {
          provider: 'EURORDIS Open Academy',
          title,
          url: 'https://academy.example/courses/open-academy-schools-in-barcelona',
          evidenceUrl: 'https://academy.example/courses',
          sourceKind: 'official-listing',
          confidence: 'medium',
        },
      ],
      [],
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.url).toContain('/courses/');
    expect(result.duplicates).toBe(1);
  });
  it('consolidates same-host locale variants after detail-page validation', () => {
    const result = consolidateDiscoveryCandidates(
      [
        {
          provider: 'NORD',
          title: 'From Records to Research: Making Sense of Health Data for Rare Diseases',
          url: 'https://learn.example/courses/from-records-to-research',
          evidenceUrl: 'https://learn.example/courses',
          sourceKind: 'official-listing',
          confidence: 'high',
          language: 'en',
        },
        {
          provider: 'NORD',
          title:
            'De los registros a la investigación: el sentido detrás de los datos sobre la salud para enfermedades raras',
          url: 'https://learn.example/courses/de-los-registros-a-la-investigacion',
          evidenceUrl: 'https://learn.example/courses',
          sourceKind: 'official-listing',
          confidence: 'high',
          language: 'es',
        },
      ],
      [],
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.url).toContain('/from-records-to-research');
    expect(result.duplicates).toBe(1);
  });
  it('does not consolidate different annual editions', () => {
    const base: DiscoveryCandidate = {
      provider: 'Official provider',
      title: 'Rare disease summer school',
      url: 'https://official.example/courses/summer-school-2026',
      evidenceUrl: 'https://official.example/courses',
      sourceKind: 'official-listing',
      confidence: 'high',
    };
    const result = consolidateDiscoveryCandidates(
      [
        base,
        {
          ...base,
          url: 'https://official.example/courses/summer-school-2027',
        },
      ],
      [],
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.duplicates).toBe(0);
  });
  it('rejects homepages, editorial announcements and archive indexes as findings', () => {
    const base: DiscoveryCandidate = {
      provider: 'Official rare-disease provider',
      title: 'Rare disease education programme',
      url: 'https://official.example/',
      evidenceUrl: 'https://official.example/courses',
      sourceKind: 'official-listing',
      confidence: 'medium',
    };
    const html = `<html><head><title>Rare disease education programme</title></head>
      <body><main><h1>Rare disease education programme</h1><p>Courses, webinars and training for rare diseases.</p></main></body></html>`;

    const homepage = validateDiscoveryCandidate(base, html, base.url);
    expect(homepage.reasons).toContain('provider homepage rather than a course page');

    const announcement = validateDiscoveryCandidate(
      { ...base, title: 'Applications launch for rare disease school 2026' },
      html.replaceAll(
        'Rare disease education programme',
        'Applications launch for rare disease school 2026',
      ),
      'https://official.example/news/applications-launch-for-school-2026',
    );
    expect(announcement.reasons).toContain(
      'announcement or supporting page rather than a course page',
    );

    const archive = validateDiscoveryCandidate(
      { ...base, title: 'Rare disease webinar series archive' },
      html.replaceAll('Rare disease education programme', 'Rare disease webinar series archive'),
      'https://official.example/education/webinar-series-archive',
    );
    expect(archive.reasons).toContain('archive or collection page rather than a course page');

    const structuredCourse = validateDiscoveryCandidate(
      { ...base, title: 'Rare disease data course launched' },
      `<html lang="en"><script type="application/ld+json">${JSON.stringify({
        '@type': 'Course',
        name: 'Rare disease data course',
        url: 'https://official.example/news/rare-disease-data-course',
      })}</script><main><h1>Rare disease data course</h1><p>Online learning for rare diseases.</p></main></html>`,
      'https://official.example/news/rare-disease-data-course',
    );
    expect(structuredCourse.accepted).toBe(true);
    expect(structuredCourse.candidate.language).toBe('en');

    const aboutUs = validateDiscoveryCandidate(
      { ...base, provider: 'NHS rare disease education', title: 'About us' },
      `<main><h1>About us</h1><p>Our rare disease education and training team.</p></main>`,
      'https://official.example/about-us',
    );
    expect(aboutUs.reasons).toContain('navigation, quiz or download URL');

    const retrospective = validateDiscoveryCandidate(
      {
        ...base,
        title:
          'Open Academy x ERDERA Schools in Barcelona strengthen practical links between patient advocacy and rare disease research',
      },
      `<main><h1>EURORDIS - Rare Diseases Europe</h1><p>Rare disease school training and education news.</p></main>`,
      'https://official.example/open-academy-schools-barcelona',
    );
    expect(retrospective.reasons).toContain(
      'announcement or supporting page rather than a course page',
    );
  });
  it('turns a known course page change into a field-level review proposal', async () => {
    const record = (await loadRecords())[0]!;
    const proposal = knownRecordChangeProposal(
      record,
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Course',
        name: `${record.content.title_original} updated`,
        startDate: '2027-01-15T10:00:00Z',
        endDate: '2027-01-15T12:00:00Z',
      })}</script>`,
      '2026-08-25T10:00:00.000Z',
      'new-hash',
    );
    expect(proposal).not.toBeNull();
    expect(proposal!.record_id).toBe(record.id);
    expect(proposal!.changes.map((change) => change.field)).toContain('content.title_original');
    expect(proposal!.changes.every((change) => change.review_required)).toBe(true);
  });
  it('suppresses volatile content-hash-only changes on known pages', async () => {
    const record = (await loadRecords())[0]!;
    const proposal = knownRecordChangeProposal(
      record,
      `<main><h1>${record.content.title_original}</h1><p>Navigation changed.</p></main>`,
      '2026-08-31T10:00:00.000Z',
      'new-hash',
    );
    expect(proposal).toBeNull();
  });
  it('parses ICS, RSS and Atom without live network access', async () => {
    expect(parseIcs(await fixture('calendar.ics'))[0]?.title).toBe('Rare disease workshop');
    expect(parseFeed(await fixture('feed.rss'))[0]?.title).toBe('New course');
    expect(parseFeed(await fixture('feed.atom'))[0]?.url).toContain('official.example');
  });
  it('treats prompt-like source text as inert text and strips scripts', async () => {
    const text = relevantText(await fixture('malicious-source.html'));
    expect(text).toContain('Ignore previous instructions');
    expect(text).not.toContain("fetch('https://attacker.invalid')");
  });
  it('respects robots longest-match rules', async () => {
    const rules = parseRobots(await fixture('robots.txt'));
    expect(robotsAllows('/private/record', rules)).toBe(false);
    expect(robotsAllows('/private/public-course/1', rules)).toBe(true);
  });
});
