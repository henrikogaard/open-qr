import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  CLAIM_COOKIE,
  adoptClaimedQrCodes,
  countClaimableQrCodes,
  hashClaimToken
} from '$lib/server/claims';

/**
 * Adopts this browser's anonymous QR codes into the logged-in account.
 * Requires both the session (who receives them) and the claim cookie
 * (proof the browser created them).
 */
export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const token = cookies.get(CLAIM_COOKIE);
  if (!token) {
    return json({ success: true, data: { adopted: 0 } });
  }

  const tokenHash = hashClaimToken(token);
  const adopted = adoptClaimedQrCodes(locals.user.id, tokenHash);
  if (countClaimableQrCodes(tokenHash) === 0) {
    cookies.delete(CLAIM_COOKIE, { path: '/' });
  }
  return json({ success: true, data: { adopted } });
};
