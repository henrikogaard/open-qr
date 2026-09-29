import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createQRCode, listQRCodes, generateQRImage, generateQRSVG, sanitizeQrCode } from '$lib/server/qr';
import { buildStaticPayload, isStaticKind } from '$lib/server/qr-payloads';
import { getBooleanSetting } from '$lib/server/settings';
import { buildShortUrl } from '$lib/server/urls';
import { assertSafeTargetUrl } from '$lib/server/url-safety';
import { assertCanUseCustomSlug } from '$lib/server/custom-slugs';
import { getCampaign } from '$lib/server/campaigns';
import { CLAIM_COOKIE, claimCookieOptions, newClaimToken } from '$lib/server/claims';
import { shouldSecureCookie } from '$lib/server/cookie-secure';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const qrCodes = listQRCodes(locals.user.id).map(sanitizeQrCode);
  return json({ success: true, data: qrCodes });
};

export const POST: RequestHandler = async ({ request, locals, url, cookies, platform }) => {
  const preview = url.searchParams.get('preview') === '1';
  const allowAnonymous = getBooleanSetting('ENABLE_ANONYMOUS_CREATION', true);

  if (!preview && !locals.user && !allowAnonymous) {
    throw error(401, 'Authentication required');
  }

  let body: {
    targetUrl?: string;
    kind?: string;
    payload?: Record<string, unknown>;
    style?: Record<string, string>;
    shortCode?: string;
    expiresAt?: string;
    password?: string;
    campaignId?: number;
  };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }
  const { targetUrl, kind, payload, style, shortCode, expiresAt, password, campaignId } = body;

  // Static kinds (WiFi, vCard, …) encode their payload directly instead of a
  // short URL: the payload builder validates fields, and rendering skips the
  // URL scheme allow-list (a "WIFI:…" string is not a navigable URL).
  const staticKind = isStaticKind(kind) ? kind : null;
  let encodedPayload = '';
  if (staticKind) {
    try {
      encodedPayload = buildStaticPayload(staticKind, payload);
    } catch (err: any) {
      throw error(400, err?.message || 'Invalid payload');
    }
  } else if (!targetUrl) {
    throw error(400, 'Target URL is required');
  }

  try {
    if (preview) {
      if (staticKind) {
        const dataUrl = await generateQRImage(encodedPayload, style, { raw: true });
        const svg = await generateQRSVG(encodedPayload, style, { raw: true });
        return json({ success: true, data: { dataUrl, svg, kind: staticKind } });
      }

      // Validate the *target* URL even on the preview path so the user gets
      // immediate feedback for unsupported schemes / blacklisted hosts. The
      // QR itself encodes the short URL, but a preview is only useful when
      // the underlying target would actually be persistable.
      await assertSafeTargetUrl(targetUrl!, { threatIntel: false });

      // QR encodes the short URL so scans route through /go/<code>; for the
      // preview we use a same-length placeholder code so the module density
      // matches the final persisted code exactly.
      const placeholder = buildShortUrl('PREVIEW1', url.origin);
      const dataUrl = await generateQRImage(placeholder, style);
      const svg = await generateQRSVG(placeholder, style);
      return json({ success: true, data: { dataUrl, svg } });
    }

    if (staticKind) {
      // Anonymous creates are claimable: reuse (or mint) the browser's claim
      // token so a later login can adopt these rows.
      let claimToken: string | null = null;
      if (!locals.user) {
        claimToken = cookies.get(CLAIM_COOKIE) ?? null;
        if (!claimToken) {
          claimToken = newClaimToken();
          cookies.set(CLAIM_COOKIE, claimToken, claimCookieOptions(shouldSecureCookie(url, platform)));
        }
      }
      const normalizedShortCode = shortCode
        ? assertCanUseCustomSlug(String(shortCode), locals.user)
        : undefined;
      const normalizedCampaignId = campaignId ? Number(campaignId) : undefined;
      if (normalizedCampaignId && (!locals.user || !getCampaign(normalizedCampaignId, locals.user.id))) {
        throw error(400, 'Campaign not found');
      }
      const result = createQRCode(
        encodedPayload,
        locals.user?.id || null,
        style,
        normalizedShortCode,
        expiresAt,
        undefined,
        normalizedCampaignId,
        claimToken,
        staticKind
      );

      // Re-render the exact persisted payload (identical to the preview).
      const dataUrl = await generateQRImage(encodedPayload, style, { raw: true });
      const svg = await generateQRSVG(encodedPayload, style, { raw: true });

      return json({ success: true, data: { ...result, dataUrl, svg, kind: staticKind } });
    }

    await assertSafeTargetUrl(targetUrl!);
    // Anonymous creates are claimable: reuse (or mint) the browser's claim
    // token so a later login can adopt these rows.
    let claimToken: string | null = null;
    if (!locals.user) {
      claimToken = cookies.get(CLAIM_COOKIE) ?? null;
      if (!claimToken) {
        claimToken = newClaimToken();
        cookies.set(CLAIM_COOKIE, claimToken, claimCookieOptions(shouldSecureCookie(url, platform)));
      }
    }
    const normalizedShortCode = shortCode
      ? assertCanUseCustomSlug(String(shortCode), locals.user)
      : undefined;
    const normalizedCampaignId = campaignId ? Number(campaignId) : undefined;
    if (normalizedCampaignId && (!locals.user || !getCampaign(normalizedCampaignId, locals.user.id))) {
      throw error(400, 'Campaign not found');
    }
    const result = createQRCode(
      targetUrl!,
      locals.user?.id || null,
      style,
      normalizedShortCode,
      expiresAt,
      password,
      normalizedCampaignId,
      claimToken
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
