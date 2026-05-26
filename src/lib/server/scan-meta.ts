/**
 * Derive country and device class for a scan without storing raw identifiers.
 *
 * Country: read from common upstream-proxy headers (Cloudflare, Vercel, Fly,
 * Netlify, generic). Self-hosted deployments behind such a proxy get geo data
 * for free; bare deployments simply store null — no third-party API calls.
 *
 * Device class: coarse UA sniff into mobile/tablet/desktop. The raw UA is
 * hashed before storage; the class is derived here and stored as a separate
 * column.
 */

const COUNTRY_HEADERS = [
  'cf-ipcountry', // Cloudflare
  'x-vercel-ip-country',
  'x-country-code',
  'x-appengine-country', // Google App Engine
  'fly-client-ip-country',
  'x-nf-geo-country' // Netlify
] as const;

export function detectCountry(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const v = headers.get(name);
    if (!v) continue;
    const trimmed = v.trim().toUpperCase();
    // ISO 3166-1 alpha-2 is two letters; "XX" / "T1" (Tor) are valid signals.
    if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  }
  return null;
}

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot';

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot/i;
const TABLET_RE = /iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk/i;
const MOBILE_RE = /Mobi|iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i;

export function detectDeviceClass(userAgent: string | null): DeviceClass {
  if (!userAgent) return 'desktop';
  if (BOT_RE.test(userAgent)) return 'bot';
  if (TABLET_RE.test(userAgent)) return 'tablet';
  if (MOBILE_RE.test(userAgent)) return 'mobile';
  return 'desktop';
}
