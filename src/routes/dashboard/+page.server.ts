import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { CLAIM_COOKIE, countClaimableQrCodes, hashClaimToken } from '$lib/server/claims';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Codes created anonymously in this browser that the account can adopt.
  const claimToken = cookies.get(CLAIM_COOKIE);
  const adoptableCount = claimToken ? countClaimableQrCodes(hashClaimToken(claimToken)) : 0;

  return {
    user: locals.user,
    adoptableCount
  };
};
