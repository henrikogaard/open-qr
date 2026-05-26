-- Capture device class (mobile/desktop/tablet) at scan time.
-- Country already has a column from 001_initial.sql but was never populated;
-- the scan handler now sets both.
ALTER TABLE scan_logs ADD COLUMN device_class TEXT;

CREATE INDEX IF NOT EXISTS idx_scan_logs_country ON scan_logs(country);
CREATE INDEX IF NOT EXISTS idx_scan_logs_device_class ON scan_logs(device_class);
