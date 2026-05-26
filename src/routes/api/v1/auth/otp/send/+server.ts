import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendLoginCode } from '$lib/server/auth';
import { getBooleanSetting } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request }) => {
  if (!getBooleanSetting('ENABLE_OTP_AUTH', true)) {
    throw error(403, 'OTP authentication is disabled');
  }

  const body = await request.json();
  const { email } = body;

  if (!email || !email.includes('@')) {
    throw error(400, 'Valid email is required');
  }

  await sendLoginCode(email);

  return json({ success: true, message: 'OTP sent' });
};
