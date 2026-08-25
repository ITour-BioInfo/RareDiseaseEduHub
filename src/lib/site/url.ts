export function normalizeBase(base = '/') {
  return base === '/' ? '/' : `/${base.replace(/^\/+|\/+$/g, '')}/`;
}

export function withBase(pathname: string, base = import.meta.env?.BASE_URL || '/') {
  const normalizedBase = normalizeBase(base);
  const clean = pathname.replace(/^\/+/, '');
  return `${normalizedBase}${clean}`.replace(/\/{2,}/g, '/');
}

export function absoluteUrl(
  pathname: string,
  site = import.meta.env?.SITE || 'http://localhost:4321',
  base = import.meta.env?.BASE_URL || '/',
) {
  return new URL(withBase(pathname, base), site).toString();
}
