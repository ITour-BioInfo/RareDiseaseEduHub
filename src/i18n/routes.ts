import type { Locale } from './config';

export const routes = {
  home: { bg: '/', en: '/en/' },
  credentials: {
    bg: '/certificates-and-diplomas/',
    en: '/en/certificates-and-diplomas/',
  },
  methodology: { bg: '/metodologiya/', en: '/en/methodology/' },
  policy: { bg: '/redakcionna-politika/', en: '/en/editorial-policy/' },
  accessibility: { bg: '/dostapnost/', en: '/en/accessibility/' },
  data: { bg: '/danni/', en: '/en/data/' },
  corrections: { bg: '/korekcii/', en: '/en/corrections/' },
  changes: { bg: '/promeni/', en: '/en/changes/' },
  privacy: { bg: '/poveritelnost/', en: '/en/privacy/' },
} as const;

export type RouteKey = keyof typeof routes;
export function route(locale: Locale, key: RouteKey) {
  return routes[key][locale];
}
export function resourceRoute(locale: Locale, id: string) {
  return locale === 'bg' ? `/resursi/${id}/` : `/en/resources/${id}/`;
}
