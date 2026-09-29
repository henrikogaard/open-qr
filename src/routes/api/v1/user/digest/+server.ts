import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { getBooleanSetting } from '$lib/server/settings';

/**
 * Weekly scan-digest opt-in. Opting in is always allowed; whether digests
 * actually send is additionally gated by the admin's ENABLE_WEEKLY_DIGEST.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const row = db
    .prepare('SELECT digest_opt_in FROM users WHERE id = ?')
    .get(locals.user.id) as { digest_opt_in: number } | undefined;
  return json({
    success: true,
    data: {
      enabled: Boolean(row?.digest_opt_in),
      globallyEnabled: getBooleanSetting('ENABLE_WEEKLY_DIGEST', false)
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }

  const enabled = body.enabled === true ? 1 : 0;
  db.prepare('UPDATE users SET digest_opt_in = ? WHERE id = ?').run(enabled, locals.user.id);
  return json({ success: true, data: { enabled: Boolean(enabled) } });
};
