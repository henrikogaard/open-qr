import { createHmac, timingSafeEqual } from 'crypto';
import { getSetting } from './settings';

/**
 * Short-lived proof that a scanner passed a QR code's password gate.
 *
 * The gate itself is now a POST form action (passwords used to ride in the
 * query string, leaking into history and proxy logs). Verifying inline in the
 * action isn't enough because the flow may hop pages afterwards — interstitial
 * "Continue", or a re-scan minutes later — so success mints an HMAC-signed,
 * path-scoped, 10-minute cookie. Signed with the per-install secret (same
 * random key material as the captcha challenges) so it can't be forged, and
 * scoped to /go/<code> so it's not even sent anywhere else.
 */

const PW_GATE_TTL_MS = 10 * 60_000;

export function pwCookieName(shortCode: string): string {
  return `openqr_pw_${shortCode}`;
}

function sign(shortCode: string, expiresAt: number): string {
  return createHmac('sha256', getSetting('CAPTCHA_SECRET', ''))
    .update(`pwgate:${shortCode}:${expiresAt}`)
    .digest('hex');
}

export function issuePwGate(shortCode: string): { value: string; maxAge: number } {
  const expiresAt = Date.now() + PW_GATE_TTL_MS;
  return {
    value: `${expiresAt}.${sign(shortCode, expiresAt)}`,
    maxAge: Math.floor(PW_GATE_TTL_MS / 1000)
  };
}

export function verifyPwGate(shortCode: string, token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiresAt = Number(token.slice(0, dot));
  const signature = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = sign(shortCode, expiresAt);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
