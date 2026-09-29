import { describe, it, expect, beforeEach } from 'vitest';
import { createWebhook, deleteWebhook, deliverScanEvent, listWebhooks, signWebhookBody } from './webhooks';
import { db } from '$lib/db';

// Public IP literal: assertPublicHttpUrl passes without a DNS round-trip and
// the stubbed fetcher means no real network traffic in tests.
const PUBLIC_HOOK_URL = 'http://203.0.113.10/hook';

function createUser(email: string): number {
  return Number(db.prepare('INSERT INTO users (email) VALUES (?)').run(email).lastInsertRowid);
}

describe('webhooks', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM webhooks').run();
    db.prepare('DELETE FROM users').run();
  });

  it('rejects private/loopback endpoints at registration (SSRF)', async () => {
    const userId = createUser('ssrf@example.com');
    await expect(createWebhook(userId, 'http://127.0.0.1:8080/hook')).rejects.toThrow();
    await expect(createWebhook(userId, 'http://192.168.1.5/hook')).rejects.toThrow();
    await expect(createWebhook(userId, 'http://localhost/hook')).rejects.toThrow();
  });

  it('creates a webhook with a generated secret, lists it, deletes it', async () => {
    const userId = createUser('ok@example.com');
    const hook = await createWebhook(userId, PUBLIC_HOOK_URL);
    expect(hook.secret).toMatch(/^[0-9a-f]{48}$/);

    expect(listWebhooks(userId).length).toBe(1);
    expect(deleteWebhook(userId, hook.id)).toBe(true);
    expect(listWebhooks(userId).length).toBe(0);
  });

  it('signs bodies deterministically with HMAC-SHA256', () => {
    const sig = signWebhookBody('secret', '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(sig).toBe(signWebhookBody('secret', '{"a":1}'));
    expect(sig).not.toBe(signWebhookBody('other', '{"a":1}'));
  });

  it('delivers scan events with signature headers and records status', async () => {
    const userId = createUser('deliver@example.com');
    const hook = await createWebhook(userId, PUBLIC_HOOK_URL);

    const deliveries: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      deliveries.push({ url: String(url), init });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const event = {
      event: 'scan' as const,
      shortCode: 'abc12345',
      targetUrl: 'https://example.com/dest',
      variantLabel: null,
      timestamp: '2030-01-01T00:00:00.000Z',
      country: 'NO',
      deviceClass: 'mobile'
    };
    await deliverScanEvent(userId, event, { fetcher });

    expect(deliveries.length).toBe(1);
    expect(deliveries[0].url).toBe(PUBLIC_HOOK_URL);
    const headers = deliveries[0].init.headers as Record<string, string>;
    expect(headers['X-OpenQR-Event']).toBe('scan');
    expect(headers['X-OpenQR-Signature']).toBe(signWebhookBody(hook.secret, JSON.stringify(event)));

    const after = listWebhooks(userId)[0];
    expect(after.last_status).toBe('ok');
    expect(after.last_delivery_at).toBeTruthy();
  });

  it('records failures instead of throwing', async () => {
    const userId = createUser('failing@example.com');
    await createWebhook(userId, PUBLIC_HOOK_URL);

    const fetcher = (async () => {
      throw new Error('connection refused');
    }) as typeof fetch;

    await expect(
      deliverScanEvent(userId, {
        event: 'scan',
        shortCode: 'abc12345',
        targetUrl: 'https://example.com',
        variantLabel: null,
        timestamp: '2030-01-01T00:00:00.000Z',
        country: null,
        deviceClass: 'desktop'
      }, { fetcher })
    ).resolves.toBeUndefined();

    expect(listWebhooks(userId)[0].last_status).toMatch(/^error: /);
  });

  it('never follows redirects to private addresses (SSRF bypass)', async () => {
    const userId = createUser('redirect@example.com');
    await createWebhook(userId, PUBLIC_HOOK_URL);

    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' }
      });
    }) as typeof fetch;

    await deliverScanEvent(userId, {
      event: 'scan',
      shortCode: 'abc12345',
      targetUrl: 'https://example.com',
      variantLabel: null,
      timestamp: '2030-01-01T00:00:00.000Z',
      country: null,
      deviceClass: 'mobile'
    }, { fetcher });

    // The only fetch is the original public endpoint — the metadata redirect
    // was rejected at validation, before any request to it.
    expect(calls).toEqual([PUBLIC_HOOK_URL]);
    expect(listWebhooks(userId)[0].last_status).toMatch(/private or local address/);
  });

  it('follows redirects through public hops and delivers to the final target', async () => {
    const userId = createUser('hop@example.com');
    await createWebhook(userId, PUBLIC_HOOK_URL);
    const FINAL_URL = 'http://203.0.113.20/final';

    const calls: { url: string; method: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), method: init.method || 'GET' });
      if (String(url) === PUBLIC_HOOK_URL) {
        return new Response(null, { status: 302, headers: { location: FINAL_URL } });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await deliverScanEvent(userId, {
      event: 'scan',
      shortCode: 'abc12345',
      targetUrl: 'https://example.com',
      variantLabel: null,
      timestamp: '2030-01-01T00:00:00.000Z',
      country: null,
      deviceClass: 'mobile'
    }, { fetcher });

    expect(calls.map((c) => c.url)).toEqual([PUBLIC_HOOK_URL, FINAL_URL]);
    expect(calls.every((c) => c.method === 'POST')).toBe(true);
    expect(listWebhooks(userId)[0].last_status).toBe('ok');
  });
});
