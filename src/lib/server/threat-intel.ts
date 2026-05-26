import { resolve4 as defaultResolve4 } from 'node:dns/promises';
import { getBooleanSetting, getSetting } from './settings';

export interface ThreatIntelResult {
  blocked: boolean;
  provider?: string;
  reason?: string;
  warnings?: string[];
}

export interface ThreatIntelDeps {
  fetcher?: typeof fetch;
  resolve4?: (hostname: string) => Promise<string[]>;
}

interface ProviderVerdict {
  listed: boolean;
  reason?: string;
}

const WEB_RISK_THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function providerError(provider: string, err: unknown): string {
  return `${provider} check failed: ${err instanceof Error ? err.message : String(err)}`;
}

async function checkGoogleWebRisk(url: string, fetcher: typeof fetch): Promise<ProviderVerdict> {
  const apiKey = getSetting('WEB_RISK_API_KEY', '').trim();
  if (!apiKey) return { listed: false };

  const endpoint = new URL('https://webrisk.googleapis.com/v1/uris:search');
  endpoint.searchParams.set('uri', url);
  for (const threatType of WEB_RISK_THREAT_TYPES) {
    endpoint.searchParams.append('threatTypes', threatType);
  }
  endpoint.searchParams.set('key', apiKey);

  const response = await fetcher(endpoint);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as { threat?: { threatTypes?: string[] } };
  const types = body.threat?.threatTypes || [];
  if (types.length > 0) {
    return { listed: true, reason: `Google Web Risk flagged the URL as ${types.join(', ')}` };
  }

  return { listed: false };
}

async function checkUrlhaus(url: string, fetcher: typeof fetch): Promise<ProviderVerdict> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const authKey = getSetting('URLHAUS_AUTH_KEY', '').trim();
  if (authKey) headers['Auth-Key'] = authKey;

  const response = await fetcher('https://urlhaus-api.abuse.ch/v1/url/', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ url })
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as { query_status?: string; threat?: string };
  if (body.query_status === 'ok') {
    return { listed: true, reason: `URLhaus flagged the URL as ${body.threat || 'malware'}` };
  }

  return { listed: false };
}

async function checkPhishTank(url: string, fetcher: typeof fetch): Promise<ProviderVerdict> {
  const body = new URLSearchParams({
    url,
    format: 'json'
  });
  const appKey = getSetting('PHISHTANK_APP_KEY', '').trim();
  if (appKey) body.set('app_key', appKey);

  const response = await fetcher('https://checkurl.phishtank.com/checkurl/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'open-qr/threat-intel'
    },
    body
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = ((await response.json()) as any).results;
  if (result?.valid === true && result?.in_database === true) {
    return { listed: true, reason: 'PhishTank verified this URL as phishing' };
  }

  return { listed: false };
}

function hostnameSuffixes(hostname: string): string[] {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  const suffixes: string[] = [];
  for (let i = 0; i <= parts.length - 2; i += 1) {
    suffixes.push(parts.slice(i).join('.'));
  }
  return suffixes;
}

async function checkSpamhausDbl(url: string, resolve4: (hostname: string) => Promise<string[]>): Promise<ProviderVerdict> {
  const parsed = new URL(url);
  const zone = getSetting('SPAMHAUS_DBL_ZONE', 'dbl.spamhaus.org').trim() || 'dbl.spamhaus.org';

  for (const suffix of hostnameSuffixes(parsed.hostname)) {
    try {
      const answers = await resolve4(`${suffix}.${zone}`);
      if (answers.some((answer) => answer.startsWith('127.'))) {
        return { listed: true, reason: `Spamhaus DBL listed ${suffix}` };
      }
    } catch (err: any) {
      if (!['ENOTFOUND', 'ENODATA', 'ETIMEOUT'].includes(err?.code)) throw err;
    }
  }

  return { listed: false };
}

export async function checkThreatIntel(url: string, deps: ThreatIntelDeps = {}): Promise<ThreatIntelResult> {
  if (!getBooleanSetting('ENABLE_THREAT_INTEL', false) || !isWebUrl(url)) {
    return { blocked: false };
  }

  const fetcher = deps.fetcher || fetch;
  const resolve4 = deps.resolve4 || defaultResolve4;
  const failClosed = getBooleanSetting('THREAT_INTEL_FAIL_CLOSED', false);
  const warnings: string[] = [];
  const providers: [string, () => Promise<ProviderVerdict>][] = [];

  if (getBooleanSetting('ENABLE_WEB_RISK', false)) {
    providers.push(['Google Web Risk', () => checkGoogleWebRisk(url, fetcher)]);
  }
  if (getBooleanSetting('ENABLE_URLHAUS', false)) {
    providers.push(['URLhaus', () => checkUrlhaus(url, fetcher)]);
  }
  if (getBooleanSetting('ENABLE_PHISHTANK', false)) {
    providers.push(['PhishTank', () => checkPhishTank(url, fetcher)]);
  }
  if (getBooleanSetting('ENABLE_SPAMHAUS_DBL', false)) {
    providers.push(['Spamhaus DBL', () => checkSpamhausDbl(url, resolve4)]);
  }

  for (const [provider, check] of providers) {
    try {
      const verdict = await check();
      if (verdict.listed) {
        return { blocked: true, provider, reason: verdict.reason };
      }
    } catch (err) {
      const warning = providerError(provider, err);
      warnings.push(warning);
      if (failClosed) {
        return { blocked: true, provider, reason: warning, warnings };
      }
    }
  }

  return warnings.length > 0 ? { blocked: false, warnings } : { blocked: false };
}
