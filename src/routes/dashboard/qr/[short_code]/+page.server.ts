import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getQRCode } from '$lib/server/qr';
import { buildShortUrl } from '$lib/server/urls';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const qr = getQRCode(params.short_code);
  if (!qr) {
    throw error(404, 'QR code not found');
  }

  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }

  return {
    user: locals.user,
    qr,
    shortUrl: buildShortUrl(params.short_code, url.origin)
  };
};
