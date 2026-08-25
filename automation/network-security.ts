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

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4)
    return privateV4.some((pattern) => pattern.test(address)) || address === '255.255.255.255';
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('::ffff:127.')
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
