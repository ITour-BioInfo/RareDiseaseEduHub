export function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractJsonLd(html: string) {
  const values: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      values.push(JSON.parse(match[1] || ''));
    } catch {
      /* malformed source data remains untrusted */
    }
  }
  return values;
}

export function relevantText(html: string) {
  return stripHtml(html).slice(0, 20_000);
}
