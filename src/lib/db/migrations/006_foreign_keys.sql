-- Enforce the foreign keys the schema always declared but SQLite (default
-- PRAGMA foreign_keys = OFF) silently ignored, and add the FK actions the
-- cleanup sweep relies on (CASCADE on user/QR deletion).
--
-- SQLite cannot ALTER constraints, so child tables are rebuilt and their rows
-- copied. otp_codes gains an `email` column so a login code can be issued to
-- an address that has no user row yet — accounts are only created when the
-- code is verified, which stops bots from mass-creating empty accounts via
-- the OTP-send endpoint.
--
-- Runs inside the transaction the migration runner provides, while the
-- connection still has foreign_keys OFF, so legacy orphan rows can't fail the
-- copy. The runner turns the pragma on after all migrations complete.

CREATE TABLE otp_codes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO otp_codes_new (id, user_id, email, code, expires_at, used, created_at)
  SELECT o.id, o.user_id, u.email, o.code, o.expires_at, o.used, o.created_at
  FROM otp_codes o LEFT JOIN users u ON u.id = o.user_id;
DROP TABLE otp_codes;
ALTER TABLE otp_codes_new RENAME TO otp_codes;
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id ON otp_codes(user_id);

CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO sessions_new (id, user_id, expires_at, created_at)
  SELECT id, user_id, expires_at, created_at FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE TABLE api_keys_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO api_keys_new (id, user_id, key_hash, name, last_used_at, created_at)
  SELECT id, user_id, key_hash, name, last_used_at, created_at FROM api_keys;
DROP TABLE api_keys;
ALTER TABLE api_keys_new RENAME TO api_keys;

CREATE TABLE scan_logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  country TEXT,
  user_agent_hash TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  device_class TEXT
);
INSERT INTO scan_logs_new (id, qr_code_id, ip_hash, country, user_agent_hash, timestamp, device_class)
  SELECT id, qr_code_id, ip_hash, country, user_agent_hash, timestamp, device_class FROM scan_logs;
DROP TABLE scan_logs;
ALTER TABLE scan_logs_new RENAME TO scan_logs;
CREATE INDEX IF NOT EXISTS idx_scan_logs_qr_code_id ON scan_logs(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_timestamp ON scan_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_scan_logs_country ON scan_logs(country);
CREATE INDEX IF NOT EXISTS idx_scan_logs_device_class ON scan_logs(device_class);

CREATE TABLE style_presets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'default',
  foreground_color TEXT NOT NULL DEFAULT '#000000',
  background_color TEXT NOT NULL DEFAULT '#FFFFFF',
  border_size TEXT NOT NULL DEFAULT 'medium',
  border_style TEXT NOT NULL DEFAULT 'solid',
  center_type TEXT NOT NULL DEFAULT 'none',
  center_text TEXT,
  center_text_color TEXT NOT NULL DEFAULT '#000000',
  error_correction TEXT NOT NULL DEFAULT 'M',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO style_presets_new (id, user_id, name, template, foreground_color, background_color, border_size, border_style, center_type, center_text, center_text_color, error_correction, created_at)
  SELECT id, user_id, name, template, foreground_color, background_color, border_size, border_style, center_type, center_text, center_text_color, error_correction, created_at FROM style_presets;
DROP TABLE style_presets;
ALTER TABLE style_presets_new RENAME TO style_presets;
CREATE INDEX IF NOT EXISTS idx_style_presets_user_id ON style_presets(user_id);

CREATE TABLE campaigns_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO campaigns_new (id, user_id, name, description, created_at)
  SELECT id, user_id, name, description, created_at FROM campaigns;
DROP TABLE campaigns;
ALTER TABLE campaigns_new RENAME TO campaigns;
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);

CREATE TABLE qr_codes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code TEXT UNIQUE NOT NULL,
  target_url TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  password_hash TEXT,
  scan_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  template TEXT DEFAULT 'default',
  foreground_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#FFFFFF',
  border_size TEXT DEFAULT 'medium',
  border_style TEXT DEFAULT 'solid',
  center_type TEXT DEFAULT 'none',
  center_image_url TEXT,
  center_text TEXT,
  center_text_color TEXT DEFAULT '#000000',
  error_correction TEXT DEFAULT 'M',
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL
);
INSERT INTO qr_codes_new SELECT * FROM qr_codes;
DROP TABLE qr_codes;
ALTER TABLE qr_codes_new RENAME TO qr_codes;
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_short_code ON qr_codes(short_code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_expires_at ON qr_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_qr_codes_campaign_id ON qr_codes(campaign_id);
