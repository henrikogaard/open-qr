import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllSettings, setSetting } from '$lib/server/settings';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  return json({ success: true, data: getAllSettings() });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  const body = await request.json();
  
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      setSetting(key, value);
    }
  }
  
  return json({ success: true, data: getAllSettings() });
};
