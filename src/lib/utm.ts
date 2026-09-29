/**
 * UTM parameter helper shared by the generator and the edit form: collects
 * campaign tagging inputs and appends them to an http(s) target URL. The
 * stored target keeps the parameters, so the receiving site's own analytics
 * sees them — nothing extra is tracked by Open-QR itself.
 */

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

export const EMPTY_UTM: UtmParams = { source: '', medium: '', campaign: '', term: '', content: '' };

export function hasUtmParams(utm: Partial<UtmParams>): boolean {
  return Object.values(utm).some((v) => typeof v === 'string' && v.trim() !== '');
}

export function appendUtmParams(targetUrl: string, utm: Partial<UtmParams>): string {
  if (!hasUtmParams(utm)) return targetUrl;

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return targetUrl; // not an absolute URL — leave it alone
  }
  // Only web destinations make sense; tagging mailto:/tel: would corrupt them.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return targetUrl;

  const entries = Object.entries(utm) as [keyof UtmParams, string | undefined][];
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.trim() !== '') {
      parsed.searchParams.set(`utm_${key}`, value.trim());
    }
  }
  return parsed.toString();
}
