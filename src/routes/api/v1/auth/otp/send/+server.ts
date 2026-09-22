import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OtpRateLimitError, sendLoginCode } from '$lib/server/auth';
import { getBooleanSetting } from '$lib/server/settings';
import { verifyCaptchaSolution } from '$lib/server/captcha';
import { resolveClientIp } from '$lib/server/client-ip';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!getBooleanSetting('ENABLE_OTP_AUTH', true)) {
    throw error(403, 'OTP authentication is disabled');
  }

  let body: { email?: unknown; captcha?: { payload?: unknown; number?: unknown }; website?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // treated as missing fields below
  }

  // Honeypot: hidden field real users never fill. Respond as if the mail was
  // sent so naive scripts don't learn anything.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ success: true, message: 'If the email exists, a code has been sent.' });
  }

  const email = body.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw error(400, 'Valid email is required');
  }

  if (getBooleanSetting('ENABLE_SIGNUP_CAPTCHA', true)) {
    const captcha = body.captcha;
    if (!captcha || !verifyCaptchaSolution(captcha.payload, captcha.number)) {
      throw error(400, 'Captcha verification failed. Please try again.');
    }
  }

  const ip = resolveClientIp(request, getClientAddress);

  try {
    await sendLoginCode(email, { ip });
  } catch (err) {
    if (!(err instanceof OtpRateLimitError)) {
      throw err;
    }
    // Keep the response generic to avoid leaking whether the address exists.
  }

  return json({ success: true, message: 'If the email exists, a code has been sent.' });
};
