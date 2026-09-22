import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { getSetting } from './settings';

/**
 * Proof-of-work captcha (ALTCHA-style) for the login/OTP flow.
 *
 * No third-party widget, no cookies, no analytics: the server issues a
 * HMAC-signed challenge, the browser brute-forces a number whose SHA-256 has
 * no special property other than matching the challenge — finding it costs
 * ~500k hashes (a second of browser CPU), verifying it is one hash. This
 * prices scripted OTP spam at real CPU per attempt while staying invisible
 * to humans, which fits the self-hosted/privacy stance better than a
 * Turnstile/hCaptcha dependency.
 *
 * Threat model: raises the cost of bulk scripted signups. It is not a bot
 * proof — the per-IP and per-email OTP rate limits remain the hard cap.
 *
 * Challenges are single-use and expire. Used-challenge tracking is in-memory
 * (consistent with the rate limiter): single-container is the supported
 * model, and a restart merely re-admits a handful of 15-minute-old tokens.
 */

const ALGORITHM = 'SHA-256';
const CHALLENGE_TTL_MS = 15 * 60_000;
// 2^20 candidates on average — ~1s of browser CPU, sub-millisecond to verify.
const MAX_NUMBER = 1_048_576;

export interface CaptchaChallenge {
  /** Base64 challenge bundle the client echoes back with its solution. */
  payload: string;
  algorithm: string;
  challenge: string;
  salt: string;
  maxnumber: number;
}

function captchaSecret(): string {
  // Initialized by initDefaultSettings() at startup; empty only in tests.
  return getSetting('CAPTCHA_SECRET', '');
}

function sign(salt: string, challenge: string, expiresAt: number): string {
  return createHmac('sha256', captchaSecret()).update(`${salt}:${challenge}:${expiresAt}`).digest('hex');
}

export function issueCaptchaChallenge(): CaptchaChallenge {
  const salt = randomBytes(12).toString('hex');
  const secretNumber = randomInt(0, MAX_NUMBER);
  const challenge = createHash('sha256').update(salt + String(secretNumber)).digest('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  const payload = Buffer.from(
    JSON.stringify({ algorithm: ALGORITHM, challenge, salt, expiresAt, signature: sign(salt, challenge, expiresAt) })
  ).toString('base64');

  return { payload, algorithm: ALGORITHM, challenge, salt, maxnumber: MAX_NUMBER };
}

interface CaptchaPayload {
  algorithm: string;
  challenge: string;
  salt: string;
  expiresAt: number;
  signature: string;
}

function parsePayload(payload: string): CaptchaPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<CaptchaPayload>;
    if (
      typeof p.algorithm !== 'string' ||
      typeof p.challenge !== 'string' ||
      typeof p.salt !== 'string' ||
      typeof p.signature !== 'string' ||
      typeof p.expiresAt !== 'number'
    ) {
      return null;
    }
    return p as CaptchaPayload;
  } catch {
    return null;
  }
}

function hmacEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Single-use tracking, keyed by a hash of the full payload. Entries are
// pruned on the same schedule as the rate limiter.
const usedChallenges = new Map<string, number>();
let lastPrune = Date.now();

function pruneUsed(now: number): void {
  if (now - lastPrune < 5 * 60_000) return;
  for (const [hash, expiry] of usedChallenges) {
    if (expiry < now) usedChallenges.delete(hash);
  }
  lastPrune = now;
}

export function verifyCaptchaSolution(payload: unknown, solution: unknown): boolean {
  if (typeof payload !== 'string' || !payload) return false;
  if (typeof solution !== 'number' || !Number.isInteger(solution) || solution < 0) return false;

  const now = Date.now();
  pruneUsed(now);

  const payloadHash = createHash('sha256').update(payload).digest('hex');
  if (usedChallenges.has(payloadHash)) return false;

  const parsed = parsePayload(payload);
  if (!parsed) return false;
  if (parsed.algorithm !== ALGORITHM) return false;
  if (parsed.expiresAt <= now) return false;
  if (!hmacEqual(parsed.signature, sign(parsed.salt, parsed.challenge, parsed.expiresAt))) return false;

  const attempted = createHash('sha256').update(parsed.salt + String(solution)).digest('hex');
  if (attempted !== parsed.challenge) return false;

  usedChallenges.set(payloadHash, parsed.expiresAt);
  return true;
}

/** For tests. */
export function _resetCaptcha(): void {
  usedChallenges.clear();
  lastPrune = Date.now();
}
