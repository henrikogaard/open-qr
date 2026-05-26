import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }
  
  if (!locals.user.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  return {
    user: locals.user
  };
};
