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
  RATE_LIMIT_PER_MINUTE: '60'
};

for (const [key, value] of Object.entries(defaults)) {
  const existing = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

db.close();
