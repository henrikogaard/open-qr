import { db } from '$lib/db';

export function getSetting(key: string, defaultValue: string = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function getBooleanSetting(key: string, defaultValue: boolean = false): boolean {
  const value = getSetting(key, defaultValue ? 'true' : 'false');
  return value === 'true';
}

export function getNumberSetting(key: string, defaultValue: number): number {
  const raw = getSetting(key, '');
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

export function initDefaultSettings(): void {
  const defaults: Record<string, string> = {
    'ENABLE_OTP_AUTH': 'true',
    'ENABLE_ANONYMOUS_CREATION': 'true',
    'BRAND_NAME': 'Open-QR',
    'DEFAULT_TEMPLATE': 'default',
    'DEFAULT_ERROR_CORRECTION': 'M',
    'ENABLE_BLACKLIST': 'true',
    'ENABLE_SUSPICIOUS_BLOCK': 'true',
    'ENABLE_THREAT_INTEL': 'false',
    'THREAT_INTEL_FAIL_CLOSED': 'false',
    'ENABLE_WEB_RISK': 'false',
    'WEB_RISK_API_KEY': '',
    'ENABLE_URLHAUS': 'false',
    'URLHAUS_AUTH_KEY': '',
    'ENABLE_PHISHTANK': 'false',
    'PHISHTANK_APP_KEY': '',
    'ENABLE_SPAMHAUS_DBL': 'false',
    'SPAMHAUS_DBL_ZONE': 'dbl.spamhaus.org',
    'ENABLE_PLAUSIBLE': 'false',
    'PLAUSIBLE_DOMAIN': '',
    'PLAUSIBLE_SCRIPT_SRC': 'https://plausible.io/js/script.js',
    'ENABLE_CUSTOM_SLUGS': 'false',
    'CUSTOM_SLUGS_ADMIN_ONLY': 'true',
    'ENABLE_DESTINATION_INTERSTITIAL': 'false',
    'RATE_LIMIT_PER_MINUTE': '60',
    'MAX_QR_PER_USER': '0',
    'PUBLIC_BASE_URL': '',
    'TERMS_VERSION': '2026-05-26',
    'TERMS_CONTACT_EMAIL': '',
    'TERMS_OPERATOR': ''
  };
  
  for (const [key, value] of Object.entries(defaults)) {
    const existing = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
    if (!existing) {
      setSetting(key, value);
    }
  }
}
