import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createWebhook, listWebhooks } from '$lib/server/webhooks';

/** The signing secret is only ever shown in full at creation — like API keys. */
function maskSecret(secret: string): string {
  return `${secret.slice(0, 6)}…`;
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const webhooks = listWebhooks(locals.user.id).map((hook) => ({
    id: hook.id,
    url: hook.url,
    secretPreview: maskSecret(hook.secret),
    is_active: hook.is_active,
    last_delivery_at: hook.last_delivery_at,
    last_status: hook.last_status,
    created_at: hook.created_at
  }));
  return json({ success: true, data: webhooks });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }

  const existing = listWebhooks(locals.user.id);
  if (existing.length >= 10) {
    throw error(400, 'A user can have at most 10 webhooks');
  }

  try {
    const hook = await createWebhook(locals.user.id, String(body.url || ''));
    return json({
      success: true,
      data: {
        id: hook.id,
        url: hook.url,
        secret: hook.secret,
        is_active: hook.is_active,
        created_at: hook.created_at
      }
    });
  } catch (err: any) {
    if (err && typeof err.status === 'number') throw err;
    throw error(400, err?.message || 'Invalid webhook URL');
  }
};
