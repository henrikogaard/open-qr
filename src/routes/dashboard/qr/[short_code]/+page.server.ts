import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getQRCode, sanitizeQrCode } from '$lib/server/qr';
import { decodeStaticPayload, isStaticKind } from '$lib/server/qr-payloads';
import { buildShortUrl } from '$lib/server/urls';
import { listVariants } from '$lib/server/variants';
import { listCampaigns } from '$lib/server/campaigns';

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

  const isStatic = isStaticKind(qr.kind);
  // Pre-fill the static edit form from the stored payload. Null means the
  // payload couldn't be parsed back — the UI falls back to read-only display.
  const decodedPayload = isStatic ? decodeStaticPayload(qr.kind, qr.target_url) : null;

  return {
    user: locals.user,
    qr: sanitizeQrCode(qr),
    campaigns: listCampaigns(locals.user.id),
    shortUrl: isStatic ? '' : buildShortUrl(params.short_code, url.origin),
    isStatic,
    decodedPayload,
    variants: isStatic ? [] : listVariants(qr.id)
  };
};
