import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listSessions } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    sessions: listSessions(locals.user.id, cookies.get('auth_session') ?? null)
  };
};
