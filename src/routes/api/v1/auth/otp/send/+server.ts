import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OtpRateLimitError, sendLoginCode } from '$lib/server/auth';
import { getBooleanSetting } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!getBooleanSetting('ENABLE_OTP_AUTH', true)) {
    throw error(403, 'OTP authentication is disabled');
  }

  const body = await request.json();
  const { email } = body;

  if (!email || !email.includes('@')) {
    throw error(400, 'Valid email is required');
  }

  const ip = getClientAddress();

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
