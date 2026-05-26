import Database from 'better-sqlite3';
import './db-migrate.mjs';

const dbPath = process.env.DATABASE_URL || './data/openqr.db';
const db = new Database(dbPath);

const defaults = {
  ENABLE_OTP_AUTH: 'true',
  ENABLE_ANONYMOUS_CREATION: 'true',
  BRAND_NAME: 'Open-QR',
  DEFAULT_TEMPLATE: 'default',
  DEFAULT_ERROR_CORRECTION: 'M',
  ENABLE_BLACKLIST: 'true',
  ENABLE_SUSPICIOUS_BLOCK: 'true',
  ENABLE_THREAT_INTEL: 'false',
  THREAT_INTEL_FAIL_CLOSED: 'false',
  ENABLE_WEB_RISK: 'false',
  WEB_RISK_API_KEY: '',
  ENABLE_URLHAUS: 'false',
  URLHAUS_AUTH_KEY: '',
  ENABLE_PHISHTANK: 'false',
  PHISHTANK_APP_KEY: '',
  ENABLE_SPAMHAUS_DBL: 'false',
  SPAMHAUS_DBL_ZONE: 'dbl.spamhaus.org',
  ENABLE_PLAUSIBLE: 'false',
  PLAUSIBLE_DOMAIN: '',
  PLAUSIBLE_SCRIPT_SRC: 'https://plausible.io/js/script.js',
  ENABLE_CUSTOM_SLUGS: 'false',
  CUSTOM_SLUGS_ADMIN_ONLY: 'true',
  ENABLE_DESTINATION_INTERSTITIAL: 'false',
  RATE_LIMIT_PER_MINUTE: '60',
  MAX_QR_PER_USER: '0',
  PUBLIC_BASE_URL: '',
  TERMS_VERSION: '2026-05-26',
  TERMS_CONTACT_EMAIL: '',
  TERMS_OPERATOR: ''
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

db.close();
