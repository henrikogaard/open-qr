import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteCampaign, getCampaign } from '$lib/server/campaigns';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  const campaign = getCampaign(Number(params.id), locals.user.id);
  if (!campaign) throw error(404, 'Campaign not found');
  return json({ success: true, data: campaign });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Authentication required');
  deleteCampaign(Number(params.id), locals.user.id);
  return json({ success: true });
};
