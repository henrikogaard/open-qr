import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQRCode, updateQRCode, deleteQRCode, generateQRImage, generateQRSVG, sanitizeQrCode } from '$lib/server/qr';
import { buildStaticPayload, isStaticKind } from '$lib/server/qr-payloads';
import { buildShortUrl } from '$lib/server/urls';
import { assertSafeTargetUrl } from '$lib/server/url-safety';
import { getCampaign } from '$lib/server/campaigns';
import { listVariants, replaceVariants } from '$lib/server/variants';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qr = getQRCode(params.short_code);
  if (!qr) throw error(404, 'QR code not found');
  if (qr.user_id !== locals.user.id && !locals.user.isAdmin) {
    throw error(403, 'Access denied');
  }

  return json({ success: true, data: sanitizeQrCode(qr) });
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
  
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }

  // Static codes are edited by re-submitting their payload fields; the
  // builder re-validates and the encoded result replaces target_url.
  const staticKind = isStaticKind(qr.kind) ? qr.kind : isStaticKind(body.kind) ? body.kind : null;
  if (staticKind && body.payload && typeof body.payload === 'object') {
    try {
      body.target_url = buildStaticPayload(staticKind, body.payload);
    } catch (err: any) {
      throw error(400, err?.message || 'Invalid payload');
    }
    delete body.payload;
    delete body.kind;
  }

  if (typeof body.target_url === 'string' && !staticKind) {
    await assertSafeTargetUrl(body.target_url);
  }
  if (body.campaign_id) {
    const campaignId = Number(body.campaign_id);
    if (!getCampaign(campaignId, locals.user.id)) throw error(400, 'Campaign not found');
    body.campaign_id = campaignId;
  }

  // Variant sets are replaced wholesale. Each target runs the full URL
  // safety pipeline before the sync validator persists them.
  if (Array.isArray(body.variants)) {
    if (qr.kind && qr.kind !== 'url') {
      throw error(400, 'Only dynamic (URL) QR codes can have target variants');
    }
    for (const variant of body.variants) {
      if (variant && typeof variant === 'object' && typeof variant.targetUrl === 'string') {
        await assertSafeTargetUrl(variant.targetUrl);
      }
    }
    try {
      replaceVariants(qr.id, body.variants);
    } catch (err: any) {
      throw error(400, err?.message || 'Invalid variants');
    }
  }
  delete body.variants;

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
  const isStatic = updated.kind !== 'url';
  const encoded = isStatic ? updated.target_url : buildShortUrl(params.short_code, url.origin);
  const renderOptions = isStatic ? { raw: true } : {};
  const shortUrl = isStatic ? '' : encoded;
  const dataUrl = await generateQRImage(encoded, style, renderOptions);
  const svg = await generateQRSVG(encoded, style, renderOptions);

  return json({
    success: true,
    data: {
      ...sanitizeQrCode(updated),
      shortUrl,
      dataUrl,
      svg,
      variants: updated.kind === 'url' ? listVariants(updated.id) : []
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
