import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { issueCaptchaChallenge } from '$lib/server/captcha';

// Issues a proof-of-work challenge for the login page. Global /api rate
// limits apply; solving is the client's job, verification happens on
// /auth/otp/send.
export const GET: RequestHandler = async () => {
  return json({ success: true, data: issueCaptchaChallenge() });
};
