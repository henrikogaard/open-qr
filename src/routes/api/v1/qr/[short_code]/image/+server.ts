import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQRCode, generateQRImage } from '$lib/server/qr';
import { buildShortUrl } from '$lib/server/urls';

/**
 * Renders this code's QR — its short URL plus stored styling — as PNG bytes
 * for dashboard thumbnails. Same access rule as GET /api/v1/qr/[short_code].
 * Short max-age so cards refresh after an edit without hammering the renderer.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }

  const style = {
    template: qr.template,
    foregroundColor: qr.foreground_color,
    backgroundColor: qr.background_color,
    borderSize: qr.border_size,
    borderStyle: qr.border_style,
    centerType: qr.center_type,
    centerImageUrl: qr.center_image_url,
    centerText: qr.center_text,
    centerTextColor: qr.center_text_color,
    errorCorrection: qr.error_correction
  };
  const shortUrl = buildShortUrl(params.short_code, url.origin);
  const dataUrl = await generateQRImage(shortUrl, style);
  const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');

  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=60'
    }
  });
};
