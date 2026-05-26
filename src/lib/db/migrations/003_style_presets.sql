-- Per-user saved QR style presets. Only styling fields are kept here — target
-- URL / expiry / password are inherently per-QR and don't belong in a preset.
CREATE TABLE IF NOT EXISTS style_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
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

CREATE INDEX IF NOT EXISTS idx_style_presets_user_id ON style_presets(user_id);
