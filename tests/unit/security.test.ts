import { describe, expect, it } from 'vitest';
import { isPrivateAddress, validateSourceUrl } from '../../automation/network-security';

describe('crawler network restrictions', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fd00::1',
    '::ffff:10.0.0.1',
    '::ffff:192.168.1.1',
    '::ffff:a00:1',
    '0:0:0:0:0:ffff:7f00:1',
  ])('blocks private address %s', (address) => expect(isPrivateAddress(address)).toBe(true));
  it('allows an IPv4-mapped public destination', () => {
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });
  it('blocks non-HTTP protocols and unapproved redirects', () => {
    expect(() => validateSourceUrl('file:///etc/passwd')).toThrow();
    expect(() => validateSourceUrl('https://attacker.example/x', ['official.example'])).toThrow(
      'Unapproved',
    );
    expect(
      validateSourceUrl('https://courses.official.example/x', ['official.example']).hostname,
    ).toBe('courses.official.example');
  });
});
