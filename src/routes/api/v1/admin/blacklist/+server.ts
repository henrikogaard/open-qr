import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '$lib/server/blacklist';
import { setSetting, getBooleanSetting } from '$lib/server/settings';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  return json({
    success: true,
    data: {
      enabled: getBooleanSetting('ENABLE_BLACKLIST', true),
      suspiciousEnabled: getBooleanSetting('ENABLE_SUSPICIOUS_BLOCK', true),
      patterns: getBlacklist()
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  const body = await request.json();
  const { pattern, isRegex, enabled, suspiciousEnabled } = body;
  
  if (enabled !== undefined) {
    setSetting('ENABLE_BLACKLIST', enabled ? 'true' : 'false');
  }
  
  if (suspiciousEnabled !== undefined) {
    setSetting('ENABLE_SUSPICIOUS_BLOCK', suspiciousEnabled ? 'true' : 'false');
  }
  
  if (pattern) {
    addToBlacklist(pattern, isRegex);
  }
  
  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) {
    throw error(403, 'Admin access required');
  }
  
  const id = parseInt(url.searchParams.get('id') || '0');
  if (!id) throw error(400, 'ID required');
  
  removeFromBlacklist(id);
  return json({ success: true });
};
