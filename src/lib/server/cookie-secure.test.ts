import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { shouldSecureCookie } from './cookie-secure';

function platform(encrypted?: boolean) {
  return { req: { socket: { encrypted } } as unknown as IncomingMessage };
}

afterEach(() => {
  delete process.env.PROTOCOL_HEADER;
});

describe('shouldSecureCookie', () => {
  it('is secure for a direct TLS connection', () => {
    expect(shouldSecureCookie(new URL('https://x/'), platform(true))).toBe(true);
  });

  it('is secure when a configured proxy header vouches https', () => {
    process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
    expect(shouldSecureCookie(new URL('https://x/'), platform(false))).toBe(true);
  });

  it('is not secure for the adapter-node https default guess on plain HTTP', () => {
    // url.protocol says https only because adapter-node guessed; the socket
    // is plain and no proxy header is configured.
    expect(shouldSecureCookie(new URL('https://x/'), platform(false))).toBe(false);
  });

  it('is not secure for plain http urls', () => {
    expect(shouldSecureCookie(new URL('http://x/'), platform(false))).toBe(false);
    expect(shouldSecureCookie(new URL('http://x/'), undefined)).toBe(false);
  });
});
