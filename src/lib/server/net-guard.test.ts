import { describe, expect, it } from 'vitest';
import {
  PrivateAddressError,
  assertPublicHttpUrl,
  fetchPublicImage,
  isPrivateAddress
} from './net-guard';

const resolveTo = (addresses: string[]) => async () => addresses.map((address) => ({ address, family: 4 }));
const neverResolve: never[] = [];

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1'])(
    'flags private IPv4 %s',
    (address) => expect(isPrivateAddress(address)).toBe(true)
  );

  it.each(['172.32.0.1', '8.8.8.8', '1.1.1.1'])('allows public IPv4 %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false)
  );

  it.each(['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])(
    'flags private IPv6 %s',
    (address) => expect(isPrivateAddress(address)).toBe(true)
  );

  it.each(['2606:4700::1111', '2001:4860:4860::8888'])('allows public IPv6 %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false)
  );

  it('treats unparseable addresses as private', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('assertPublicHttpUrl', () => {
  it('accepts a public http(s) URL', async () => {
    await expect(
      assertPublicHttpUrl('https://example.com/logo.png', { resolve: resolveTo(['93.184.216.34']) })
    ).resolves.toBeInstanceOf(URL);
  });

  it.each(['http://localhost/logo.png', 'http://app.localhost/logo.png', 'http://metadata.local/x'])(
    'rejects local hostnames (%s)',
    async (url) => {
      await expect(assertPublicHttpUrl(url, { resolve: resolveTo(neverResolve) })).rejects.toBeInstanceOf(
        PrivateAddressError
      );
    }
  );

  it.each(['http://127.0.0.1:8080/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/'])(
    'rejects literal private IPs (%s)',
    async (url) => {
      await expect(assertPublicHttpUrl(url, { resolve: resolveTo(neverResolve) })).rejects.toBeInstanceOf(
        PrivateAddressError
      );
    }
  );

  it('rejects non-http schemes', async () => {
    await expect(
      assertPublicHttpUrl('ftp://example.com/logo.png', { resolve: resolveTo(['8.8.8.8']) })
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });

  it('rejects hosts resolving into a private range', async () => {
    await expect(
      assertPublicHttpUrl('https://internal.example.com/', { resolve: resolveTo(['10.0.0.5']) })
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });

  it('rejects hosts that do not resolve', async () => {
    await expect(
      assertPublicHttpUrl('https://nx.example.com/', { resolve: resolveTo(neverResolve) })
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });

  it('rejects when any resolved address is private', async () => {
    await expect(
      assertPublicHttpUrl('https://dual.example.com/', { resolve: resolveTo(['8.8.8.8', '192.168.0.1']) })
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });
});

describe('fetchPublicImage', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  function fetcherWith(responses: Response[]) {
    let call = 0;
    return (async () => {
      const res = responses[call];
      call += 1;
      if (!res) throw new Error('unexpected extra fetch');
      return res;
    }) as typeof fetch;
  }

  it('returns the buffer for a public image', async () => {
    const image = await fetchPublicImage('https://example.com/logo.png', {
      resolve: resolveTo(['93.184.216.34']),
      fetcher: fetcherWith([new Response(png, { headers: { 'content-type': 'image/png' } })])
    });
    expect(image.buffer.equals(png)).toBe(true);
    expect(image.contentType).toBe('image/png');
  });

  it('follows public redirects and re-validates the hop', async () => {
    const image = await fetchPublicImage('https://example.com/logo', {
      resolve: resolveTo(['93.184.216.34']),
      fetcher: fetcherWith([
        new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/logo.png' } }),
        new Response(png, { headers: { 'content-type': 'image/png' } })
      ])
    });
    expect(image.buffer.equals(png)).toBe(true);
  });

  it('blocks redirects into private ranges', async () => {
    await expect(
      fetchPublicImage('https://example.com/logo', {
        resolve: resolveTo(['93.184.216.34']),
        fetcher: fetcherWith([
          new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
        ])
      })
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });

  it('rejects non-image content types', async () => {
    await expect(
      fetchPublicImage('https://example.com/page', {
        resolve: resolveTo(['93.184.216.34']),
        fetcher: fetcherWith([new Response('<html></html>', { headers: { 'content-type': 'text/html' } })])
      })
    ).rejects.toThrow('Unsupported image content type');
  });

  it('enforces the size cap', async () => {
    await expect(
      fetchPublicImage('https://example.com/big.png', {
        resolve: resolveTo(['93.184.216.34']),
        maxBytes: 4,
        fetcher: fetcherWith([new Response(png, { headers: { 'content-type': 'image/png' } })])
      })
    ).rejects.toThrow('size limit');
  });
});
