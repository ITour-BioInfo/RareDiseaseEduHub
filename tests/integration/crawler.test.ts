import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractJsonLd, relevantText } from '../../automation/html-extract';
import { parseFeed, parseIcs } from '../../automation/feeds';
import { eventsFromJsonLd } from '../../automation/structured-data';
import { discoverFromHtml, discoveryProposal } from '../../automation/discovery';
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
      'old-hash',
      'new-hash',
    );
    expect(proposal.record_id).toBe(record.id);
    expect(proposal.changes.map((change) => change.field)).toContain('content.title_original');
    expect(proposal.changes.every((change) => change.review_required)).toBe(true);
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
