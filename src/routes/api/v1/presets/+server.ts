import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createStylePreset, listStylePresets } from '$lib/server/style-presets';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  return json({ success: true, data: listStylePresets(locals.user.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  const body = await request.json();
  if (!body?.name || typeof body.name !== 'string') {
    throw error(400, 'name is required');
  }
  try {
    const preset = createStylePreset(locals.user.id, body.name, body.style || {});
    return json({ success: true, data: preset });
  } catch (err: any) {
    throw error(400, err?.message || 'Could not create preset');
  }
};
