import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { getSetting } from '$lib/server/settings';

/**
 * Record that the current user has accepted the current Terms version.
 * Anonymous callers don't need this — their acceptance is captured by the
 * client-side checkbox on the generator form (no server-side identity to bind
 * to). Logged-in users persist acceptance so the checkbox stops appearing.
 */
export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const version = getSetting('TERMS_VERSION', '2026-05-26');
  db.prepare(
    'UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP, terms_accepted_version = ? WHERE id = ?'
  ).run(version, locals.user.id);
  return json({ success: true, data: { version } });
};
