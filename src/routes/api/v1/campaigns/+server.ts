import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCampaign, listCampaigns } from '$lib/server/campaigns';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  return json({ success: true, data: listCampaigns(locals.user.id) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  const body = await request.json();
  try {
    const campaign = createCampaign(locals.user.id, body.name || '', body.description || '');
    return json({ success: true, data: campaign });
  } catch (err: any) {
    throw error(400, err?.message || 'Bad request');
  }
};
