import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { verifyOTP } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = await request.json();
  const { email, code } = body;

  if (!email || !code) {
    throw error(400, 'Email and code are required');
  }

  const result = verifyOTP(email, code);

  if (!result.success) {
    throw error(400, 'Invalid or expired code');
  }

  // Secure: only when actually served over HTTPS. Dev (http://localhost) and
  // bare HTTP self-hosted LAN deployments would otherwise silently drop the
  // cookie and login would appear to succeed but fail to persist.
  const isHttps = !dev && url.protocol === 'https:';

  cookies.set('auth_session', result.sessionId!, {
    path: '/',
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  });

  return json({ success: true });
};
