import { createHmac, randomBytes } from 'crypto';
import { db } from '$lib/db';
import { assertPublicHttpUrl } from './net-guard';

/**
 * Scan-event webhooks. Each delivery is POSTed as JSON with an HMAC-SHA256
 * signature header (X-OpenQR-Signature) computed over the raw body with the
 * webhook's secret, so receivers can verify authenticity.
 *
 * SSRF: webhook URLs are user-supplied endpoints our server will fetch, so
 * they pass the same net-guard as QR center images — checked at registration
 * AND re-checked before every delivery (DNS can change between the two).
 * Deliveries are fire-and-forget: a slow or broken receiver never delays or
 * breaks a redirect.
 */

export interface Webhook {
  id: number;
  user_id: number;
  url: string;
  secret: string;
  is_active: number;
  last_delivery_at: string | null;
  last_status: string | null;
  created_at: string;
}

export function listWebhooks(userId: number): Webhook[] {
  return db
    .prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY id DESC')
    .all(userId) as Webhook[];
}

export async function createWebhook(userId: number, rawUrl: string): Promise<Webhook> {
  const url = rawUrl.trim();
  if (!url) throw new Error('Webhook URL is required');
  if (url.length > 2048) throw new Error('Webhook URL is too long');
  // Throws PrivateAddressError for loopback/internal targets — the same SSRF
  // surface as center images, so the same guard applies.
  await assertPublicHttpUrl(url);

  const secret = randomBytes(24).toString('hex');
  const result = db
    .prepare('INSERT INTO webhooks (user_id, url, secret) VALUES (?, ?, ?)')
    .run(userId, url, secret);
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(Number(result.lastInsertRowid)) as Webhook;
}

export function deleteWebhook(userId: number, id: number): boolean {
  const changes = db.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?').run(id, userId).changes;
  return changes > 0;
}

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export interface ScanWebhookEvent {
  event: 'scan';
  shortCode: string;
  targetUrl: string;
  variantLabel: string | null;
  timestamp: string;
  country: string | null;
  deviceClass: string | null;
}

export interface WebhookDeps {
  fetcher?: typeof fetch;
  now?: () => number;
}

/**
 * POST to a webhook with the same redirect discipline as fetchPublicImage:
 * redirects are followed manually and every hop re-validated against the
 * SSRF guard — a public URL that 302s to a metadata/internal address must
 * never receive the delivery (and must not become a port-scanning oracle
 * via last_status).
 */
async function deliverHop(
  hook: Webhook,
  body: string,
  signature: string,
  fetcher: NonNullable<WebhookDeps['fetcher']>
): Promise<void> {
  let current = await assertPublicHttpUrl(hook.url);
  for (let hops = 0; hops < 3; hops++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetcher(current, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenQR-Event': 'scan',
          'X-OpenQR-Signature': signature
        },
        body,
        signal: controller.signal,
        redirect: 'manual'
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without a location');
      res.body?.cancel();
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return;
  }
  throw new Error('Too many redirects while delivering');
}

/**
 * Fan out a scan event to the owner's active webhooks. Never throws — a
 * misconfigured receiver must not take down redirects. Delivery status is
 * recorded per webhook so the dashboard can show the last outcome.
 */
export async function deliverScanEvent(userId: number, event: ScanWebhookEvent, deps: WebhookDeps = {}): Promise<void> {
  const hooks = db
    .prepare('SELECT * FROM webhooks WHERE user_id = ? AND is_active = 1')
    .all(userId) as Webhook[];
  if (hooks.length === 0) return;

  const fetcher = deps.fetcher ?? fetch;
  const body = JSON.stringify(event);

  await Promise.all(
    hooks.map(async (hook) => {
      let status: string;
      try {
        await deliverHop(hook, body, signWebhookBody(hook.secret, body), fetcher);
        status = 'ok';
      } catch (err: any) {
        status = `error: ${err?.name === 'AbortError' ? 'timeout' : (err?.message || 'delivery failed')}`;
      }
      db.prepare('UPDATE webhooks SET last_delivery_at = ?, last_status = ? WHERE id = ?').run(
        new Date().toISOString(),
        status,
        hook.id
      );
    })
  );
}
