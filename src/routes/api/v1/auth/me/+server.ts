import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ success: true, data: null });
  }

  return json({
    success: true,
    data: {
      id: locals.user.id,
      email: locals.user.email,
      isAdmin: locals.user.isAdmin
    }
  });
};
