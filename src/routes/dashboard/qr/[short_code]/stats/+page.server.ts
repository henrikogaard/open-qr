import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getQRCode } from '$lib/server/qr';
import { buildShortUrl } from '$lib/server/urls';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) throw error(403, 'Access denied');

  const recentScans = db
    .prepare('SELECT timestamp, country, device_class FROM scan_logs WHERE qr_code_id = ? ORDER BY timestamp DESC LIMIT 100')
    .all(qr.id);
  const dailyScans = db
    .prepare(
      `SELECT date(timestamp) AS date, COUNT(*) AS count
       FROM scan_logs
       WHERE qr_code_id = ?
       GROUP BY date(timestamp)
       ORDER BY date DESC
       LIMIT 30`
    )
    .all(qr.id);
  const byCountry = db
    .prepare(
      `SELECT country, COUNT(*) AS count
       FROM scan_logs
       WHERE qr_code_id = ? AND country IS NOT NULL
       GROUP BY country
       ORDER BY count DESC`
    )
    .all(qr.id);
  const byDevice = db
    .prepare(
      `SELECT device_class, COUNT(*) AS count
       FROM scan_logs
       WHERE qr_code_id = ? AND device_class IS NOT NULL
       GROUP BY device_class
       ORDER BY count DESC`
    )
    .all(qr.id);

  return {
    qr,
    shortUrl: buildShortUrl(params.short_code, url.origin),
    stats: { recentScans, dailyScans, byCountry, byDevice, totalScans: qr.scan_count }
  };
};
