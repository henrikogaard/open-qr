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

// --- Gate attempt throttling -------------------------------------------------
// The /go/ password action sits outside the /api rate limiter, and every
// attempt pays a full PBKDF2 — without a cap it's both a brute-force channel
// and a cheap CPU-exhaustion vector. In-memory, per IP+code, same pattern
// as the OTP throttles (fine for the single-node self-hosted deployment).
const PW_ATTEMPT_LIMIT = 10;
const PW_ATTEMPT_WINDOW_MS = 5 * 60_000;
const pwAttempts = new Map<string, number[]>();

function attemptKey(shortCode: string, ip: string): string {
  return `${shortCode}|${ip}`;
}

/** True (and consumes an attempt slot) when the caller may try a password. */
export function consumePwAttempt(shortCode: string, ip: string): boolean {
  const key = attemptKey(shortCode, ip);
  const cutoff = Date.now() - PW_ATTEMPT_WINDOW_MS;
  const attempts = (pwAttempts.get(key) || []).filter((t) => t > cutoff);
  if (attempts.length >= PW_ATTEMPT_LIMIT) {
    pwAttempts.set(key, attempts);
    return false;
  }
  attempts.push(Date.now());
  pwAttempts.set(key, attempts);
  return true;
}

/** Clears the counter after a success so the gate isn't sticky for scanners. */
export function clearPwAttempts(shortCode: string, ip: string): void {
  pwAttempts.delete(attemptKey(shortCode, ip));
}

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
