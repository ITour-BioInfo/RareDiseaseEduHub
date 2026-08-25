import bg from './messages/bg.json';
import en from './messages/en.json';
import type { Locale } from './config';

const dictionaries: Record<Locale, Record<string, string>> = { bg, en };

export function t(locale: Locale, key: string, values: Record<string, string | number> = {}) {
  const message = dictionaries[locale][key];
  if (message === undefined) throw new Error(`Unknown translation key: ${locale}.${key}`);
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message,
  );
}

export function messages(locale: Locale) {
  return dictionaries[locale];
}
