import { db } from '$lib/db';
import { getBooleanSetting, getSetting } from './settings';

export function getOperationalStatus() {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const mailConfigured =
    Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.MAIL_FROM) ||
    !getBooleanSetting('ENABLE_OTP_AUTH', true);

  return {
    version: '1.2.0',
    generatedAt: new Date().toISOString(),
    features: {
      plausible: getBooleanSetting('ENABLE_PLAUSIBLE', false) && getSetting('PLAUSIBLE_DOMAIN', '').trim().length > 0,
      threatIntel: getBooleanSetting('ENABLE_THREAT_INTEL', false),
      customSlugs: getBooleanSetting('ENABLE_CUSTOM_SLUGS', false),
      destinationInterstitial: getBooleanSetting('ENABLE_DESTINATION_INTERSTITIAL', false)
    },
    checks: [
      { label: 'Database', ok: dbOk, detail: dbOk ? 'SQLite is reachable' : 'SQLite query failed' },
      {
        label: 'Mail',
        ok: mailConfigured,
        detail: mailConfigured ? 'Mail or anonymous/auth-disabled mode is configured' : 'OTP auth is enabled but no mail provider is configured'
      },
      {
        label: 'Public URL',
        ok: getSetting('PUBLIC_BASE_URL', '').trim().length > 0,
        detail: getSetting('PUBLIC_BASE_URL', '').trim() || 'Falling back to request origin'
      },
      {
        label: 'Abuse controls',
        ok: getBooleanSetting('ENABLE_BLACKLIST', true),
        detail: getBooleanSetting('ENABLE_BLACKLIST', true) ? 'Blacklist is enabled' : 'Blacklist is disabled'
      }
    ]
  };
}
