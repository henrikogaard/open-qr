import { db } from '$lib/db';

/**
 * Aggregate dashboard numbers for one user: headline tiles plus a small
 * recent-scans feed. All queries join through qr_codes so rows are scoped
 * to the user regardless of campaign/claim state, and bot traffic is
 * excluded the same way as the per-QR stats page.
 */

const HUMAN_FILTER = '(s.device_class IS NULL OR s.device_class != \'bot\')';

export interface RecentScan {
  shortCode: string;
  /** Preformatted, timezone-independent display string ("3 min ago", "2026-09-12"). */
  timeAgo: string;
  country: string | null;
  deviceClass: string | null;
}

export interface DashboardOverview {
  totalCodes: number;
  activeCodes: number;
  protectedCodes: number;
  scans7d: number;
  scans30d: number;
  totalScans: number;
  recentScans: RecentScan[];
}

/**
 * Relative time that stays correct across timezones because both the scan
 * timestamp and "now" come from the server clock. Falls back to a plain
 * ISO date past a week.
 */
function formatTimeAgo(timestamp: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(timestamp + 'Z').getTime()) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 172800) return 'yesterday';
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} days ago`;
  return timestamp.slice(0, 10);
}

export function dashboardOverview(userId: number, now: Date = new Date()): DashboardOverview {
  const codes = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN is_active THEN 1 ELSE 0 END), 0) AS active,
              COALESCE(SUM(
                CASE WHEN password_hash IS NOT NULL OR expires_at IS NOT NULL
                          OR EXISTS (SELECT 1 FROM qr_variants v WHERE v.qr_code_id = qr_codes.id)
                     THEN 1 ELSE 0 END
              ), 0) AS protectedCount
       FROM qr_codes WHERE user_id = ?`
    )
    .get(userId) as { total: number; active: number; protectedCount: number };

  const scans = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN datetime(s.timestamp) >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS d7,
         COALESCE(SUM(CASE WHEN datetime(s.timestamp) >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS d30,
         COUNT(*) AS total
       FROM scan_logs s
       JOIN qr_codes q ON q.id = s.qr_code_id
       WHERE q.user_id = ? AND q.kind = 'url' AND ${HUMAN_FILTER}`
    )
    .get(userId) as { d7: number; d30: number; total: number };

  const rows = db
    .prepare(
      `SELECT q.short_code AS shortCode, s.timestamp, s.country, s.device_class AS deviceClass
       FROM scan_logs s
       JOIN qr_codes q ON q.id = s.qr_code_id
       WHERE q.user_id = ? AND q.kind = 'url' AND ${HUMAN_FILTER}
       ORDER BY s.timestamp DESC
       LIMIT 12`
    )
    .all(userId) as { shortCode: string; timestamp: string; country: string | null; deviceClass: string | null }[];

  return {
    totalCodes: codes.total,
    activeCodes: codes.active,
    protectedCodes: codes.protectedCount,
    scans7d: scans.d7,
    scans30d: scans.d30,
    totalScans: scans.total,
    recentScans: rows.map((r) => ({
      shortCode: r.shortCode,
      timeAgo: formatTimeAgo(r.timestamp, now),
      country: r.country,
      deviceClass: r.deviceClass
    }))
  };
}
