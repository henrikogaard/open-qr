-- P3 features: session management and anonymous-code claiming.
--
-- sessions.user_agent: coarse context for the "active sessions" list so a
--   user can tell which device each session belongs to. Truncated UA string;
--   sessions are already deleted wholesale by "log out everywhere".
-- qr_codes.claim_token: SHA-256 of a cookie-held random token. Anonymous QR
--   creations store it; a later login in the same browser can adopt those
--   rows (user_id IS NULL AND claim_token matches) into the account.

ALTER TABLE sessions ADD COLUMN user_agent TEXT;

ALTER TABLE qr_codes ADD COLUMN claim_token TEXT;

CREATE INDEX IF NOT EXISTS idx_qr_codes_claim_token ON qr_codes(claim_token);
