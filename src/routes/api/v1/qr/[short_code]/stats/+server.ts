import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQRCode } from '$lib/server/qr';
import { parseRange, qrScanStats } from '$lib/server/qr-stats';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }

  const stats = qrScanStats(qr.id, qr.scan_count, parseRange(url.searchParams));
  return json({ success: true, data: stats });
};
