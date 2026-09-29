import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getQRCode, incrementScanCount, updateQRCode, verifyQRPassword } from '$lib/server/qr';
import { db } from '$lib/db';
import { createHash, createHmac } from 'crypto';
import { detectCountry, detectDeviceClass } from '$lib/server/scan-meta';
import { getBooleanSetting, getSetting } from '$lib/server/settings';
import { resolveTarget } from '$lib/server/variants';
import { clearPwAttempts, consumePwAttempt, issuePwGate, pwCookieName, verifyPwGate } from '$lib/server/pw-gate';
import { deliverScanEvent } from '$lib/server/webhooks';
import { shouldSecureCookie } from '$lib/server/cookie-secure';

function loadActiveQr(shortCode: string) {
  const qr = getQRCode(shortCode);
  if (!qr) {
    throw error(404, 'QR code not found');
  }
  if (!qr.is_active) {
    throw error(403, 'This QR code is no longer active');
  }
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
    throw error(410, 'This QR code has expired');
  }
  return qr;
}

export const load: PageServerLoad = async ({ params, request, url, cookies }) => {
  const qr = loadActiveQr(params.short_code);

  // Password gate. The form POSTs to the `password` action below; success
  // plants a short-lived signed cookie so the continue/redirect hops after
  // it don't need the secret in the URL.
  if (qr.password_hash && !verifyPwGate(params.short_code, cookies.get(pwCookieName(params.short_code)))) {
    return { requiresPassword: true, shortCode: params.short_code };
  }

  // Static payloads (WiFi, vCard, …) encode their content directly; a visit
  // here means someone typed the short URL by hand — show the content.
  if (qr.kind && qr.kind !== 'url') {
    return { staticContent: qr.target_url, staticKind: qr.kind, shortCode: params.short_code };
  }

  // Scheduled overrides and A/B splits resolve to the destination for right
  // now; the main target_url is the fallback.
  const destination = resolveTarget(qr);

  if (getBooleanSetting('ENABLE_DESTINATION_INTERSTITIAL', false) && url.searchParams.get('continue') !== '1') {
    return {
      interstitial: true,
      shortCode: params.short_code,
      targetUrl: destination.url,
      targetHost: new URL(destination.url).hostname,
      continueHref: `${url.pathname}?continue=1`
    };
  }

  // Log scan. Country comes from an upstream-proxy header (Cloudflare, Vercel,
  // Fly, etc.) before the raw IP is hashed; device class is derived from the UA
  // string before it is hashed. Raw identifiers never reach storage — and the
  // IP hash is keyed with a per-install pepper so a leaked DB can't be
  // dictionary-attacked across the (small) IPv4 space.
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const ipHash = createHmac('sha256', getSetting('IP_HASH_PEPPER', ''))
    .update(ip)
    .digest('hex');
  const userAgent = request.headers.get('user-agent') || '';
  const userAgentHash = createHash('sha256').update(userAgent).digest('hex');
  const country = detectCountry(request.headers);
  const deviceClass = detectDeviceClass(userAgent);

  db.prepare(`
    INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class, variant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(qr.id, ipHash, userAgentHash, country, deviceClass, destination.variantId);

  // scan_count is human scans: crawler hits are logged (row above) but not
  // counted, so the owner's numbers aren't inflated by bots.
  if (deviceClass !== 'bot') {
    incrementScanCount(params.short_code);

    // Fire-and-forget webhook fan-out — receivers must never delay a redirect.
    if (qr.user_id) {
      void deliverScanEvent(qr.user_id, {
        event: 'scan',
        shortCode: params.short_code,
        targetUrl: destination.url,
        variantLabel: destination.variantLabel,
        timestamp: new Date().toISOString(),
        country,
        deviceClass
      }).catch(() => {/* delivery failures are recorded per hook */});
    }
  }

  throw redirect(302, destination.url);
};

export const actions: Actions = {
  password: async ({ params, request, cookies, url, platform, getClientAddress }) => {
    const qr = loadActiveQr(params.short_code);
    if (!qr.password_hash) throw redirect(302, url.pathname);

    // Throttle BEFORE the PBKDF2 work so locked-out callers cost (almost)
    // nothing; the same caller scanning again after success is unaffected.
    const clientIp = getClientAddress();
    if (!consumePwAttempt(params.short_code, clientIp)) {
      return fail(429, { throttled: true });
    }

    const formData = await request.formData();
    const password = formData.get('password');
    if (typeof password !== 'string' || !verifyQRPassword(qr.password_hash, password)) {
      // fail() re-runs load (which returns the password form) and surfaces
      // `form.invalid` to the page.
      return fail(401, { invalid: true });
    }
    clearPwAttempts(params.short_code, clientIp);

    // Rehash-on-verify: gates hashed before the PBKDF2 ratchet are upgraded
    // transparently on successful entry.
    if (qr.password_hash.includes('$120000$')) {
      updateQRCode(params.short_code, { password_hash: password });
    }

    const gate = issuePwGate(params.short_code);
    cookies.set(pwCookieName(params.short_code), gate.value, {
      path: `/go/${params.short_code}`,
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldSecureCookie(url, platform),
      maxAge: gate.maxAge
    });

    // 303 → GET: re-runs load, which now sees the valid gate cookie and
    // proceeds to the interstitial or the redirect itself.
    throw redirect(303, url.pathname);
  }
};
