-- Static QR content types. `kind` distinguishes dynamic URL codes (the only
-- kind before 1.5) from static payloads. Static payloads are stored in the
-- existing target_url column (keeps NOT NULL, CSV export, and admin list
-- working); /go/<code> branches on kind and never redirects for static rows.
ALTER TABLE qr_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'url';

-- Alternative targets for a dynamic QR code. A row with weight > 0 joins the
-- A/B split; weight = 0 marks a scheduled override that wins while its
-- [starts_at, ends_at] window contains "now". When nothing applies, the QR
-- falls back to qr_codes.target_url.
CREATE TABLE IF NOT EXISTS qr_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code_id INTEGER NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  label TEXT,
  target_url TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  starts_at DATETIME,
  ends_at DATETIME,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qr_variants_qr_code_id ON qr_variants(qr_code_id);

-- Which variant served a redirect (NULL = the QR's main target_url). SET NULL
-- keeps scan history when variants are edited away.
ALTER TABLE scan_logs ADD COLUMN variant_id INTEGER REFERENCES qr_variants(id) ON DELETE SET NULL;

-- Scan-event webhooks, per user. The secret HMAC-signs deliveries and is
-- stored plaintext: the server needs it to sign, and unlike API keys it can't
-- be hashed for the same reason.
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  last_delivery_at DATETIME,
  last_status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);

-- Weekly scan-digest opt-in (sent only when ENABLE_WEEKLY_DIGEST is also on).
ALTER TABLE users ADD COLUMN digest_opt_in BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN last_digest_at DATETIME;
