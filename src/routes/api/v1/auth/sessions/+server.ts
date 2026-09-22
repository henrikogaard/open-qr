import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroyAllSessions, listSessions } from '$lib/server/auth';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  // "Current" only applies to the browser session cookie; API-key clients
  // see their account's sessions with none marked current.
  const current = cookies.get('auth_session') ?? null;
  return json({ success: true, data: listSessions(locals.user.id, current) });
};

// "Log out everywhere": revokes every session for the account, including
// the one making the request.
export const DELETE: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  destroyAllSessions(locals.user.id);
  cookies.delete('auth_session', { path: '/' });
  return json({ success: true });
};
