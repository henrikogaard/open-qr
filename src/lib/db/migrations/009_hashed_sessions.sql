-- 1.5.0 security hardening: session ids are now stored hashed (like API
-- keys), so a leaked database no longer hands over active sessions. There is
-- no way to re-hash existing rows in pure SQL without knowing a preimage
-- that maps to each hash, so all current sessions are invalidated — every
-- user simply logs in again once after the upgrade.
DELETE FROM sessions;
