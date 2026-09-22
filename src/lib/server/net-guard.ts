import { isIP } from 'node:net';
import { lookup as defaultResolve } from 'node:dns/promises';

/**
 * Guard for server-side fetches of user-supplied URLs (QR center images).
 *
 * Without this, the QR generator is an SSRF primitive: an attacker points
 * centerImageUrl at localhost or an internal range, and the server fetches
 * it (and reflects image bytes back into the returned PNG/SVG). Both the
 * scheme and every resolved address are checked, and redirects are followed
 * manually so each hop is re-validated — a public URL that 302s to
 * http://169.254.169.254/ is the classic bypass.
 *
 * DNS rebinding (resolve-then-fetch race) is out of scope; the fetch happens
 * immediately after validation and the endpoints that use this are capped by
 * the /api rate limiter.
 */

export interface NetGuardDeps {
  fetcher?: typeof fetch;
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

export class PrivateAddressError extends Error {
  constructor(message = 'URL points at a private or local address') {
    super(message);
    this.name = 'PrivateAddressError';
  }
}

function ipv4Private(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function ipv6Private(address: string): boolean {
  const addr = address.toLowerCase();
  if (addr === '::' || addr === '::1') return true;
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('::ffff:')) return ipv4Private(addr.slice(7)); // IPv4-mapped
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4Private(address);
  if (family === 6) return ipv6Private(address);
  return true; // unparseable addresses are treated as hostile
}

/**
 * Throws unless the URL is http(s) and every resolved address for its host
 * is public. `localhost` / `*.localhost` and bare IPs in private ranges are
 * rejected without a DNS round-trip.
 */
export async function assertPublicHttpUrl(
  rawUrl: string,
  deps: NetGuardDeps = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PrivateAddressError('URL is not parseable');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PrivateAddressError('Only http and https image URLs are supported');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new PrivateAddressError();
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isPrivateAddress(hostname)) throw new PrivateAddressError();
    return parsed;
  }

  const resolve = deps.resolve ?? ((hostname: string) => defaultResolve(hostname, { all: true }));
  const addresses = await resolve(hostname);
  if (addresses.length === 0) throw new PrivateAddressError('Host does not resolve');
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new PrivateAddressError();
  }
  return parsed;
}

const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

export interface FetchedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Fetch a user-supplied image URL with SSRF checks on every redirect hop,
 * a hard timeout, a content-type allowlist and a size cap. Throws on any
 * violation so callers can distinguish "skip the decoration" from "blocked".
 */
export async function fetchPublicImage(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } & NetGuardDeps = {}
): Promise<FetchedImage> {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetcher = options.fetcher ?? fetch;

  let current = await assertPublicHttpUrl(rawUrl, options);

  for (let hops = 0; hops < 3; hops++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetcher(current, { signal: controller.signal, redirect: 'manual' });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without a location');
      res.body?.cancel();
      current = await assertPublicHttpUrl(new URL(location, current).toString(), options);
      continue;
    }

    if (!res.ok) throw new Error(`Image fetch failed with HTTP ${res.status}`);

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_CONTENT_TYPES.has(contentType)) {
      res.body?.cancel();
      throw new Error(`Unsupported image content type: ${contentType || 'unknown'}`);
    }

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      res.body?.cancel();
      throw new Error('Image exceeds the size limit');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error('Image exceeds the size limit');
    return { buffer, contentType };
  }

  throw new Error('Too many redirects while fetching image');
}
