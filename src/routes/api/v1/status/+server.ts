import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOperationalStatus } from '$lib/server/status';

export const GET: RequestHandler = async () => {
  return json({ success: true, data: getOperationalStatus() });
};
