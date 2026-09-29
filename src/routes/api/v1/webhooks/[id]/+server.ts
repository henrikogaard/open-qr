import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteWebhook, listWebhooks } from '$lib/server/webhooks';
import { db } from '$lib/db';

async function assertOwned(id: number, userId: number): Promise<void> {
  const hook = listWebhooks(userId).find((h) => h.id === id);
  if (!hook) throw error(404, 'Webhook not found');
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const id = Number(params.id);
  await assertOwned(id, locals.user.id);

  let body: { isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body must be valid JSON');
  }

  const isActive = body.isActive === true ? 1 : 0;
  db.prepare('UPDATE webhooks SET is_active = ? WHERE id = ? AND user_id = ?').run(
    isActive,
    id,
    locals.user.id
  );
  return json({ success: true, data: { id, is_active: isActive } });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const id = Number(params.id);
  await assertOwned(id, locals.user.id);

  if (!deleteWebhook(locals.user.id, id)) {
    throw error(404, 'Webhook not found');
  }
  return json({ success: true });
};
