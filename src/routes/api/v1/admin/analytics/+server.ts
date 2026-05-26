import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  const totalScans = db.prepare('SELECT COUNT(*) as count FROM scan_logs').get() as { count: number };
  const todayScans = db.prepare(`SELECT COUNT(*) as count FROM scan_logs WHERE date(timestamp) = date('now')`).get() as { count: number };
  const totalQRs = db.prepare('SELECT COUNT(*) as count FROM qr_codes').get() as { count: number };
  const activeQRs = db.prepare('SELECT COUNT(*) as count FROM qr_codes WHERE is_active = 1').get() as { count: number };
  
  const topQRs = db.prepare(`
    SELECT short_code, target_url, scan_count 
    FROM qr_codes 
    ORDER BY scan_count DESC 
    LIMIT 10
  `).all();
  
  const countries = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM scan_logs
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY count DESC
    LIMIT 10
  `).all();

  const devices = db.prepare(`
    SELECT device_class, COUNT(*) as count
    FROM scan_logs
    WHERE device_class IS NOT NULL
    GROUP BY device_class
    ORDER BY count DESC
  `).all();

  return json({
    success: true,
    data: {
      totalScans: totalScans.count,
      todayScans: todayScans.count,
      totalQRs: totalQRs.count,
      activeQRs: activeQRs.count,
      topQRs,
      countries,
      devices
    }
  });
};
