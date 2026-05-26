import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createQRCode, listQRCodes, generateQRImage, generateQRSVG } from '$lib/server/qr';
import { getBooleanSetting } from '$lib/server/settings';
import { buildShortUrl } from '$lib/server/urls';
import { assertSafeTargetUrl } from '$lib/server/url-safety';
import { assertCanUseCustomSlug } from '$lib/server/custom-slugs';
import { getCampaign } from '$lib/server/campaigns';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  
  const qrCodes = listQRCodes(locals.user.id);
  return json({ success: true, data: qrCodes });
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
  const preview = url.searchParams.get('preview') === '1';
  const allowAnonymous = getBooleanSetting('ENABLE_ANONYMOUS_CREATION', true);

  if (!preview && !locals.user && !allowAnonymous) {
    throw error(401, 'Authentication required');
  }

  const body = await request.json();
  const { targetUrl, style, shortCode, expiresAt, password, campaignId } = body;

  if (!targetUrl) {
    throw error(400, 'Target URL is required');
  }

  try {
    if (preview) {
      // Validate the *target* URL even on the preview path so the user gets
      // immediate feedback for unsupported schemes / blacklisted hosts. The
      // QR itself encodes the short URL, but a preview is only useful when
      // the underlying target would actually be persistable.
      await assertSafeTargetUrl(targetUrl, { threatIntel: false });

      // QR encodes the short URL so scans route through /go/<code>; for the
      // preview we use a same-length placeholder code so the module density
      // matches the final persisted code exactly.
      const placeholder = buildShortUrl('PREVIEW1', url.origin);
      const dataUrl = await generateQRImage(placeholder, style);
      const svg = await generateQRSVG(placeholder, style);
      return json({ success: true, data: { dataUrl, svg } });
    }

    await assertSafeTargetUrl(targetUrl);
    const normalizedShortCode = shortCode
      ? assertCanUseCustomSlug(String(shortCode), locals.user)
      : undefined;
    const normalizedCampaignId = campaignId ? Number(campaignId) : undefined;
    if (normalizedCampaignId && (!locals.user || !getCampaign(normalizedCampaignId, locals.user.id))) {
      throw error(400, 'Campaign not found');
    }
    const result = createQRCode(
      targetUrl,
      locals.user?.id || null,
      style,
      normalizedShortCode,
      expiresAt,
      password,
      normalizedCampaignId
    );

    const shortUrl = buildShortUrl(result.shortCode, url.origin);
    const dataUrl = await generateQRImage(shortUrl, style);
    const svg = await generateQRSVG(shortUrl, style);

    return json({ success: true, data: { ...result, shortUrl, dataUrl, svg } });
  } catch (err: any) {
    // SvelteKit HttpErrors already carry their own status+body — re-throw
    // them as-is so the original 4xx message reaches the client.
    if (err && typeof err.status === 'number') throw err;
    throw error(400, err?.message || 'Bad request');
  }
};
