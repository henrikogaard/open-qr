import { db } from '$lib/db';
import { getNumberSetting } from './settings';

/**
 * Housekeeping sweep for tables that would otherwise grow forever:
 *
 * - expired sessions (previously only deleted lazily when the exact cookie
 *   was presented again),
 * - used and expired OTP codes,
 * - stale user accounts: no QR codes, no API keys, no sessions, no pending
 *   OTPs, older than PURGE_STALE_USERS_DAYS (default 30; 0 disables).
 *   Admins are never purged. This is what keeps bot-farmed addresses from
 *   accumulating — and because accounts are only created on OTP *verify*,
 *   unverified junk never reaches the users table in the first place.
 *
 * Runs at startup and then daily from hooks.server.ts.
 */

export interface CleanupResult {
  expiredSessions: number;
  spentOtpCodes: number;
  staleUsers: number;
}

export function runCleanup(): CleanupResult {
  const expiredSessions = db
    .prepare(`DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')`)
    .run().changes;

  const spentOtpCodes = db
    .prepare(`DELETE FROM otp_codes WHERE used = 1 OR datetime(expires_at) < datetime('now')`)
    .run().changes;

  let staleUsers = 0;
  const purgeAfterDays = getNumberSetting('PURGE_STALE_USERS_DAYS', 30);
  if (purgeAfterDays > 0) {
    staleUsers = db
      .prepare(
        `DELETE FROM users WHERE is_admin = 0
           AND datetime(created_at) < datetime('now', ?)
           AND NOT EXISTS (SELECT 1 FROM qr_codes q WHERE q.user_id = users.id)
           AND NOT EXISTS (SELECT 1 FROM api_keys k WHERE k.user_id = users.id)
           AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = users.id)
           AND NOT EXISTS (SELECT 1 FROM otp_codes o WHERE o.user_id = users.id AND o.used = 0)`
      )
      .run(`-${purgeAfterDays} days`).changes;
  }

  return { expiredSessions, spentOtpCodes, staleUsers };
}
