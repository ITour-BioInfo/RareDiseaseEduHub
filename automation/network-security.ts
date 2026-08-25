import { isIP } from 'node:net';

const privateV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function mappedIpv4(address: string) {
  const normalized = address.toLowerCase();
  const dotted = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1] && isIP(dotted[1]) === 4) return dotted[1];

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (
    groups.length !== 8 ||
    groups.slice(0, 5).some((group) => Number.parseInt(group || '0', 16) !== 0) ||
    Number.parseInt(groups[5] || '0', 16) !== 0xffff
  )
    return null;
  const high = Number.parseInt(groups[6] || '0', 16);
  const low = Number.parseInt(groups[7] || '0', 16);
  if (![high, low].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff))
    return null;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4)
    return privateV4.some((pattern) => pattern.test(address)) || address === '255.255.255.255';
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const mapped = mappedIpv4(normalized);
    if (mapped) return isPrivateAddress(mapped);
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }
  return false;
}

export function validateSourceUrl(value: string, approvedDomains: string[] = []) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS source URLs are allowed.');
  if (url.username || url.password) throw new Error('Source URLs must not contain credentials.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    isPrivateAddress(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  )
    throw new Error('Private and local destinations are blocked.');
  if (
    approvedDomains.length &&
    !approvedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  )
    throw new Error(`Unapproved provider domain: ${hostname}`);
  return url;
}
