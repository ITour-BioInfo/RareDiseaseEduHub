export function parseIcs(text: string) {
  return [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map((match) => {
    const body = match[1] || '';
    const field = (name: string) =>
      body.match(new RegExp(`(?:^|\\r?\\n)${name}(?:;[^:]*)?:(.*)`, 'i'))?.[1]?.trim() || null;
    return {
      uid: field('UID'),
      title: field('SUMMARY'),
      start: field('DTSTART'),
      end: field('DTEND'),
      url: field('URL'),
    };
  });
}

export function parseFeed(text: string) {
  const blocks = [...text.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const value = (body: string, tag: string) =>
    body
      .match(
        new RegExp(`<${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'),
      )?.[1]
      ?.trim() || null;
  return blocks.map(([, , body = '']) => ({
    title: value(body, 'title'),
    url: value(body, 'link') || body.match(/<link\b[^>]+href=["']([^"']+)/i)?.[1] || null,
    published: value(body, 'pubDate') || value(body, 'updated'),
  }));
}
