import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listQRCodes } from '$lib/server/qr';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  const qrCodes = listQRCodes();
  return json({ success: true, data: qrCodes });
};
