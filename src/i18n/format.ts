import type { Locale } from './config';

const tags: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB' };
export const formatDate = (value: string, locale: Locale, timeZone = 'Europe/Sofia') =>
  new Intl.DateTimeFormat(tags[locale], { dateStyle: 'long', timeZone }).format(
    new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value),
  );
export const formatNumber = (value: number, locale: Locale) =>
  new Intl.NumberFormat(tags[locale]).format(value);
export const formatList = (value: string[], locale: Locale) =>
  new Intl.ListFormat(tags[locale], { style: 'long', type: 'conjunction' }).format(value);
