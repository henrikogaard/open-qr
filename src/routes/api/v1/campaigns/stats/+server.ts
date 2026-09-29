import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';

/**
 * Per-campaign daily scan series for the dashboard comparison view: every
 * campaign of the caller with a human-scan count per day for the window.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  let days = Math.floor(Number(url.searchParams.get('days') || 14));
  if (!Number.isFinite(days)) days = 14;
  days = Math.min(Math.max(days, 1), 90);

  const rows = db
    .prepare(
      `SELECT c.id AS campaign_id, c.name, date(s.timestamp) AS date, COUNT(*) AS count
       FROM campaigns c
       JOIN qr_codes q ON q.campaign_id = c.id
       JOIN scan_logs s ON s.qr_code_id = q.id
       WHERE c.user_id = ?
         AND datetime(s.timestamp) >= datetime('now', ?)
         AND (s.device_class IS NULL OR s.device_class != 'bot')
       GROUP BY c.id, date(s.timestamp)
       ORDER BY c.id, date ASC`
    )
    .all(locals.user.id, `-${days} days`) as {
    campaign_id: number;
    name: string;
    date: string;
    count: number;
  }[];

  // Fold the flat rows into one entry per campaign with a per-day map. The
  // UI zero-fills missing days so campaigns with gaps still chart correctly.
  // Only campaigns with scans in the window are returned — the dashboard
  // already lists zero-scan campaigns from the main campaigns endpoint.
  const byCampaign = new Map<
    number,
    { campaignId: number; name: string; days: Record<string, number>; total: number }
  >();
  for (const row of rows) {
    let entry = byCampaign.get(row.campaign_id);
    if (!entry) {
      entry = { campaignId: row.campaign_id, name: row.name, days: {}, total: 0 };
      byCampaign.set(row.campaign_id, entry);
    }
    entry.days[row.date] = row.count;
    entry.total += row.count;
  }

  return json({
    success: true,
    data: { days, series: [...byCampaign.values()] }
  });
};
