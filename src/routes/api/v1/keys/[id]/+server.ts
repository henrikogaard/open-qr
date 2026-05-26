import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeApiKey } from '$lib/server/api-keys';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw error(400, 'Invalid key id');
  }
  if (!revokeApiKey(locals.user.id, id)) {
    throw error(404, 'Key not found');
  }
  return json({ success: true });
};
