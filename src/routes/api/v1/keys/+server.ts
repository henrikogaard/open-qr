import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { issueApiKey, listApiKeys } from '$lib/server/api-keys';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  return json({ success: true, data: listApiKeys(locals.user.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — name is optional
  }
  const issued = issueApiKey(locals.user.id, body.name?.trim() || null);
  return json({ success: true, data: issued });
};
