import { describe, expect, it } from 'vitest';
import bg from '../../src/i18n/messages/bg.json';
import en from '../../src/i18n/messages/en.json';
import { t } from '../../src/i18n/translate';
import { formatDate } from '../../src/i18n/format';

describe('internationalization', () => {
  it('keeps locale keys complete', () =>
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort()));
  it('fails on an unknown key', () =>
    expect(() => t('bg', 'missing.key')).toThrow('Unknown translation key'));
  it('interpolates counts', () =>
    expect(t('bg', 'catalogue.results', { shown: 2, total: 5 })).toContain('2'));
  it('formats Bulgarian dates with Intl', () =>
    expect(formatDate('2026-09-20', 'bg')).toMatch(/20.*септември.*2026/));
});
