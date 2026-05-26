import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQRCode, updateQRCode, deleteQRCode, generateQRImage, generateQRSVG } from '$lib/server/qr';
import { buildShortUrl } from '$lib/server/urls';
import { assertSafeTargetUrl } from '$lib/server/url-safety';
import { getCampaign } from '$lib/server/campaigns';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }
  
  return json({ success: true, data: qr });
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }
  
  const body = await request.json();
  if (typeof body.target_url === 'string') {
    await assertSafeTargetUrl(body.target_url);
  }
  if (body.campaign_id) {
    const campaignId = Number(body.campaign_id);
    if (!getCampaign(campaignId, locals.user.id)) throw error(400, 'Campaign not found');
    body.campaign_id = campaignId;
  }
  updateQRCode(params.short_code, body);
  
  const updated = getQRCode(params.short_code);
  const style = {
    template: updated.template,
    foregroundColor: updated.foreground_color,
    backgroundColor: updated.background_color,
    borderSize: updated.border_size,
    borderStyle: updated.border_style,
    centerType: updated.center_type,
    centerImageUrl: updated.center_image_url,
    centerText: updated.center_text,
    centerTextColor: updated.center_text_color,
    errorCorrection: updated.error_correction
  };
  const shortUrl = buildShortUrl(params.short_code, url.origin);
  const dataUrl = await generateQRImage(shortUrl, style);
  const svg = await generateQRSVG(shortUrl, style);

  return json({
    success: true,
    data: {
      ...updated,
      shortUrl,
      dataUrl,
      svg
    }
  });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }
  
  deleteQRCode(params.short_code);
  return json({ success: true });
};
