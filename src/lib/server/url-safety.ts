import { isAllowedScheme, isBlacklisted } from './blacklist';
import { checkThreatIntel, type ThreatIntelDeps } from './threat-intel';

export interface UrlSafetyOptions extends ThreatIntelDeps {
  threatIntel?: boolean;
}

export async function assertSafeTargetUrl(url: string, options: UrlSafetyOptions = {}): Promise<void> {
  const scheme = isAllowedScheme(url);
  if (!scheme.allowed) throw new Error(scheme.reason!);

  const blacklist = isBlacklisted(url);
  if (blacklist.blocked) throw new Error(`URL blocked: ${blacklist.reason}`);

  if (options.threatIntel === false) return;

  const threatIntel = await checkThreatIntel(url, options);
  if (threatIntel.blocked) {
    throw new Error(`URL blocked: ${threatIntel.reason || threatIntel.provider || 'Threat intelligence match'}`);
  }
}
