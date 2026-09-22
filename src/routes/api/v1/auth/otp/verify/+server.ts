import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { verifyOTP } from '$lib/server/auth';
import { shouldSecureCookie } from '$lib/server/cookie-secure';

export const POST: RequestHandler = async ({ request, cookies, url, platform }) => {
  const body = await request.json();
  const { email, code } = body;

  if (!email || !code) {
    throw error(400, 'Email and code are required');
  }

  const result = verifyOTP(email, code, request.headers.get('user-agent'));

  if (!result.success) {
    throw error(400, 'Invalid or expired code');
  }

  // Secure only when the connection is provably HTTPS (direct TLS or a
  // configured proxy header) — see shouldSecureCookie. adapter-node's
  // https-by-default guess would break login on bare-HTTP self-hosting.
  const secure = !dev && shouldSecureCookie(url, platform);

  cookies.set('auth_session', result.sessionId!, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  });

  return json({ success: true });
};
