import { getSetting } from './settings';

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function buildShortUrl(shortCode: string, requestOrigin?: string): string {
  const configuredBase = getSetting('PUBLIC_BASE_URL', '').trim();
  const base = normalizeBase(configuredBase || requestOrigin || '');
  return base ? `${base}/go/${shortCode}` : `/go/${shortCode}`;
}
