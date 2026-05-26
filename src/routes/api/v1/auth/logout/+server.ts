import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
  const sessionId = cookies.get('auth_session');
  if (sessionId) {
    destroySession(sessionId);
    cookies.delete('auth_session', { path: '/' });
  }
  return json({ success: true });
};
