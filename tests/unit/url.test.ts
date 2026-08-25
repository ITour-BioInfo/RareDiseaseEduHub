import { describe, expect, it } from 'vitest';
import { absoluteUrl, normalizeBase, withBase } from '../../src/lib/site/url';
describe('portable URL generation', () => {
  it('normalizes root and subdirectory bases', () => {
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('repo')).toBe('/repo/');
    expect(withBase('/en/', '/repo/')).toBe('/repo/en/');
  });
  it('creates canonical URLs without hardcoded domains', () =>
    expect(absoluteUrl('/en/', 'https://example.com', '/hub/')).toBe(
      'https://example.com/hub/en/',
    ));
});
