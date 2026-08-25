import { createHash } from 'node:crypto';
export function normalizeForHash(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\b(?:updated|last modified)[: ]+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, '')
    .trim();
}
export function contentHash(text: string) {
  return createHash('sha256').update(normalizeForHash(text)).digest('hex');
}
