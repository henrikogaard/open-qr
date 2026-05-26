import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteStylePreset } from '$lib/server/style-presets';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
  if (!deleteStylePreset(locals.user.id, id)) throw error(404, 'Preset not found');
  return json({ success: true });
};
