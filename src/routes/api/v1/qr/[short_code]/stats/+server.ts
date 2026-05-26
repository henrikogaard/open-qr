import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQRCode } from '$lib/server/qr';
import { db } from '$lib/db';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }
  
  const scans = db.prepare(`
    SELECT timestamp, country, device_class
    FROM scan_logs
    WHERE qr_code_id = ?
    ORDER BY timestamp DESC
    LIMIT 100
  `).all(qr.id);

  const dailyScans = db.prepare(`
    SELECT date(timestamp) as date, COUNT(*) as count
    FROM scan_logs
    WHERE qr_code_id = ?
    GROUP BY date(timestamp)
    ORDER BY date DESC
    LIMIT 30
  `).all(qr.id);

  const byCountry = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM scan_logs
    WHERE qr_code_id = ? AND country IS NOT NULL
    GROUP BY country
    ORDER BY count DESC
  `).all(qr.id);

  const byDevice = db.prepare(`
    SELECT device_class, COUNT(*) as count
    FROM scan_logs
    WHERE qr_code_id = ? AND device_class IS NOT NULL
    GROUP BY device_class
    ORDER BY count DESC
  `).all(qr.id);

  return json({
    success: true,
    data: {
      totalScans: qr.scan_count,
      recentScans: scans,
      dailyScans,
      byCountry,
      byDevice
    }
  });
};
