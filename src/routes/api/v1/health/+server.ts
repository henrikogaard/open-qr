import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';

export const GET: RequestHandler = async () => {
  try {
    db.prepare('SELECT 1').get();
    return json({ success: true, status: 'healthy' });
  } catch {
    return json({ success: false, status: 'unhealthy' }, { status: 503 });
  }
};
