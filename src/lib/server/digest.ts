import { db } from '$lib/db';
import { getBooleanSetting } from './settings';
import { sendDigest } from './mail';

/**
 * Weekly scan digest. Opt-in per user (users.digest_opt_in), enabled overall
 * by ENABLE_WEEKLY_DIGEST; hooked into the daily housekeeping timer, so the
 * cadence check is "at least 6.5 days since the last digest" — a daily check
 * with a sub-week threshold sends exactly weekly without a precise cron.
 *
 * Users with zero scans in the window are skipped without touching
 * last_digest_at, so their first scan mid-week still triggers the next digest.
 */

export interface DigestCandidate {
  id: number;
  email: string;
  last_digest_at: string | null;
}

export interface DigestStats {
  totalScans: number;
  topCodes: { shortCode: string; targetUrl: string; count: number }[];
}

export function digestEligibleUsers(now: number, thresholdMs: number): DigestCandidate[] {
  const cutoff = new Date(now - thresholdMs).toISOString().slice(0, 19).replace('T', ' ');
  return db
    .prepare(
      `SELECT id, email, last_digest_at FROM users
       WHERE digest_opt_in = 1
         AND (last_digest_at IS NULL OR datetime(last_digest_at) < datetime(?))`
    )
    .all(cutoff) as DigestCandidate[];
}

export function digestStatsFor(userId: number, sinceSql: string): DigestStats {
  const total = db
    .prepare(
      `SELECT COUNT(*) as count FROM scan_logs s
       JOIN qr_codes q ON q.id = s.qr_code_id
       WHERE q.user_id = ? AND datetime(s.timestamp) >= datetime(?)
         AND (s.device_class IS NULL OR s.device_class != 'bot')`
    )
    .get(userId, sinceSql) as { count: number };

  const topCodes = db
    .prepare(
      `SELECT q.short_code, q.target_url, COUNT(*) as count FROM scan_logs s
       JOIN qr_codes q ON q.id = s.qr_code_id
       WHERE q.user_id = ? AND datetime(s.timestamp) >= datetime(?)
         AND (s.device_class IS NULL OR s.device_class != 'bot')
       GROUP BY q.id ORDER BY count DESC LIMIT 5`
    )
    .all(userId, sinceSql) as { short_code: string; target_url: string; count: number }[];

  return {
    totalScans: total.count,
    topCodes: topCodes.map((c) => ({
      shortCode: c.short_code,
      targetUrl: c.target_url,
      count: c.count
    }))
  };
}

export interface DigestRunResult {
  sent: number;
  skipped: number;
}

export async function maybeSendWeeklyDigests(now: number = Date.now()): Promise<DigestRunResult> {
  if (!getBooleanSetting('ENABLE_WEEKLY_DIGEST', false)) {
    return { sent: 0, skipped: 0 };
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const THRESHOLD_MS = WEEK_MS - 2 * 60 * 60 * 1000; // daily check, ~weekly cadence
  const sinceSql = new Date(now - WEEK_MS).toISOString().slice(0, 19).replace('T', ' ');

  let sent = 0;
  let skipped = 0;
  for (const user of digestEligibleUsers(now, THRESHOLD_MS)) {
    const stats = digestStatsFor(user.id, sinceSql);
    if (stats.totalScans === 0) {
      skipped++;
      continue;
    }
    try {
      await sendDigest(user.email, stats);
      db.prepare('UPDATE users SET last_digest_at = ? WHERE id = ?').run(
        new Date(now).toISOString(),
        user.id
      );
      sent++;
    } catch (err) {
      console.error(`[digest] failed for ${user.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return { sent, skipped };
}
