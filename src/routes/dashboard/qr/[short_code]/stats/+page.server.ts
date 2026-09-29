import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getQRCode, sanitizeQrCode } from '$lib/server/qr';
import { buildShortUrl } from '$lib/server/urls';
import { parseRange, qrScanStats } from '$lib/server/qr-stats';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) throw error(403, 'Access denied');

  const isStatic = qr.kind && qr.kind !== 'url';
  const stats = isStatic
    ? null
    : qrScanStats(qr.id, qr.scan_count, parseRange(url.searchParams));

  return {
    user: locals.user,
    qr: sanitizeQrCode(qr),
    isStatic,
    shortUrl: isStatic ? '' : buildShortUrl(params.short_code, url.origin),
    stats
  };
};
