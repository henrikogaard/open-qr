import { createHash, randomBytes } from 'crypto';
import { db } from '$lib/db';

/**
 * Anonymous QR-code claiming.
 *
 * Problem: codes created while logged out have user_id NULL and are
 * unmanageable forever — the creator can prove nothing.
 *
 * Mechanism: the first anonymous creation sets an httpOnly cookie holding a
 * random token; each anonymous code stores only its SHA-256 hash. When that
 * browser later logs in, the dashboard offers to adopt the matching rows
 * (user_id IS NULL AND claim_token = hash) into the account. A database leak
 * exposes hashes, not tokens; adoption never touches codes another user
 * already owns.
 */

export const CLAIM_COOKIE = 'openqr_claims';
const CLAIM_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export function newClaimToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cookie options shared by every place the claim cookie is written. */
export function claimCookieOptions(secure: boolean) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: CLAIM_COOKIE_MAX_AGE
  };
}

export function countClaimableQrCodes(tokenHash: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM qr_codes WHERE claim_token = ? AND user_id IS NULL')
    .get(tokenHash) as { n: number };
  return row.n;
}

/** Moves this browser's anonymous codes into the account. Returns how many. */
export function adoptClaimedQrCodes(userId: number, tokenHash: string): number {
  const result = db
    .prepare('UPDATE qr_codes SET user_id = ?, claim_token = NULL WHERE claim_token = ? AND user_id IS NULL')
    .run(userId, tokenHash);
  return result.changes;
}
