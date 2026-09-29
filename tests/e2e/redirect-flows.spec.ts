import { test, expect, request as apiRequest } from '@playwright/test';
import Database from 'better-sqlite3';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

// Redirect-flow coverage for the paths unit tests can't reach end to end:
// password gate (now a POST action — no secret in the URL), the destination
// interstitial, expiry (410), static content kinds, and variant resolution.

function db() {
  return new Database(process.env.DATABASE_URL || './data/openqr.db');
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@example.test`;
}

function seedUser(): number {
  const dbh = db();
  const email = uniqueEmail('flows');
  const result = dbh.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  dbh.close();
  return Number(result.lastInsertRowid);
}

function seedQr(userId: number, overrides: Record<string, unknown> = {}): string {
  const shortCode = randomBytes(5).toString('base64url');
  const dbh = db();
  dbh
    .prepare('INSERT INTO qr_codes (short_code, target_url, user_id) VALUES (?, ?, ?)')
    .run(shortCode, 'https://example.com/target', userId);
  if (Object.keys(overrides).length > 0) {
    const set = Object.keys(overrides).map((k) => `${k} = ?`).join(', ');
    dbh.prepare(`UPDATE qr_codes SET ${set} WHERE short_code = ?`).run(
      ...Object.values(overrides),
      shortCode
    );
  }
  dbh.close();
  return shortCode;
}

/** Mirrors hashSecret() so password-protected codes can be seeded directly. */
function secretHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function setSetting(key: string, value: string): void {
  const dbh = db();
  dbh.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  dbh.close();
}

function sessionFor(userId: number): string {
  const sessionId = randomBytes(32).toString('hex');
  const dbh = db();
  dbh
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, new Date(Date.now() + 60 * 60 * 1000).toISOString());
  dbh.close();
  return sessionId;
}

test.describe.configure({ mode: 'serial' });

test('password gate: wrong password is rejected, correct password redirects and never leaks into the URL', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId, { password_hash: secretHash('hunter2') });

  await page.goto(`/go/${shortCode}`);
  await expect(page.getByRole('heading', { name: 'Protected link' })).toBeVisible();

  await page.fill('#qr-password', 'wrong-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Incorrect password.')).toBeVisible();

  await page.fill('#qr-password', 'hunter2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('https://example.com/target');
  // The gate is a POST action — the secret must never ride in the URL.
  expect(page.url()).not.toContain('password');
  expect(page.url()).not.toContain('hunter2');
});

test('expired codes return 410 Gone', async ({ request }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId, { expires_at: '2020-01-01 00:00:00' });
  const res = await request.get(`/go/${shortCode}`);
  expect(res.status()).toBe(410);
});

test('static kinds render their payload on /go and are never redirected', async ({ baseURL }) => {
  const userId = seedUser();
  const dbh = db();
  const shortCode = randomBytes(5).toString('base64url');
  dbh
    .prepare('INSERT INTO qr_codes (short_code, target_url, user_id, kind) VALUES (?, ?, ?, ?)')
    .run(shortCode, 'WIFI:T:WPA;S:E2E-Network;P:secret-pass;;', userId, 'wifi');
  dbh.close();

  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  const res = await anon.get(`/go/${shortCode}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Wi-Fi network');
  expect(html).toContain('WIFI:T:WPA;S:E2E-Network');
  await anon.dispose();

  // And no scan was logged — static codes don't route through the redirector.
  const after = db();
  const scan = after
    .prepare('SELECT COUNT(*) as count FROM scan_logs WHERE qr_code_id = (SELECT id FROM qr_codes WHERE short_code = ?)')
    .get(shortCode) as { count: number };
  after.close();
  expect(scan.count).toBe(0);
});

test('static payload creation via API renders the payload in the QR (preview parity)', async ({ baseURL }) => {
  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  const created = await anon.post('/api/v1/qr', {
    data: {
      kind: 'wifi',
      payload: { ssid: 'E2E-Cafe', password: 'latte-2026', encryption: 'WPA' }
    }
  });
  expect(created.ok()).toBeTruthy();
  const body = (await created.json()) as { data: { shortCode: string; shortUrl: string; dataUrl: string } };
  // Static codes have no scan URL — the QR encodes the payload itself.
  expect(body.data.shortUrl ?? '').toBe('');

  const stored = db();
  const row = stored.prepare('SELECT kind, target_url FROM qr_codes WHERE short_code = ?').get(body.data.shortCode) as {
    kind: string;
    target_url: string;
  };
  stored.close();
  expect(row.kind).toBe('wifi');
  expect(row.target_url).toBe('WIFI:T:WPA;S:E2E-Cafe;P:latte-2026;;');
  await anon.dispose();
});

test('scheduled variant overrides the target during its window and attributes the scan', async ({ baseURL }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  const dbh = db();
  const qrId = (dbh.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number }).id;
  dbh
    .prepare(
      'INSERT INTO qr_variants (qr_code_id, label, target_url, weight, starts_at, ends_at) VALUES (?, ?, ?, 0, ?, ?)'
    )
    .run(qrId, 'live', 'https://example.com/live-now', new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() + 3600_000).toISOString());
  dbh.close();

  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  // ?continue=1 keeps this immune to the interstitial toggle in the sibling test.
  const res = await anon.get(`/go/${shortCode}?continue=1`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toBe('https://example.com/live-now');
  await anon.dispose();

  const after = db();
  const scan = after
    .prepare('SELECT variant_id FROM scan_logs WHERE qr_code_id = ? ORDER BY id DESC LIMIT 1')
    .get(qrId) as { variant_id: number | null };
  after.close();
  expect(scan.variant_id).not.toBeNull();
});

test('A/B weighted variants split traffic between targets', async ({ baseURL }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  const dbh = db();
  const qrId = (dbh.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number }).id;
  const insert = dbh.prepare(
    'INSERT INTO qr_variants (qr_code_id, label, target_url, weight) VALUES (?, ?, ?, ?)'
  );
  insert.run(qrId, 'a', 'https://example.com/variant-a', 70);
  insert.run(qrId, 'b', 'https://example.com/variant-b', 30);
  dbh.close();

  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  const hits: Record<string, number> = { 'https://example.com/variant-a': 0, 'https://example.com/variant-b': 0 };
  for (let i = 0; i < 40; i++) {
    const res = await anon.get(`/go/${shortCode}?continue=1`, { maxRedirects: 0 });
    hits[res.headers()['location']]!++;
  }
  await anon.dispose();

  // Both variants served traffic (40 draws at 70/30: P(one side gets 0) ≈ 0).
  expect(hits['https://example.com/variant-a']).toBeGreaterThan(0);
  expect(hits['https://example.com/variant-b']).toBeGreaterThan(0);
});

test('destination interstitial shows the host and continues on click', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  setSetting('ENABLE_DESTINATION_INTERSTITIAL', 'true');
  try {
    await page.goto(`/go/${shortCode}`);
    await expect(page.getByRole('heading', { name: 'Continue to destination?' })).toBeVisible();
    await expect(page.getByText('example.com')).toBeVisible();

    await page.getByRole('link', { name: 'Continue' }).click();
    await page.waitForURL('https://example.com/target');
  } finally {
    setSetting('ENABLE_DESTINATION_INTERSTITIAL', 'false');
  }
});

test('UTM builder tags the stored destination URL', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.fill('#target-url', 'https://example.com/utm-landing');
  await page.getByRole('button', { name: /UTM tracking parameters/ }).click();
  await page.fill('#utm-source', 'poster');
  await page.fill('#utm-medium', 'qr');
  await page.fill('#utm-campaign', 'spring-launch');
  await page.getByRole('button', { name: 'Generate QR code' }).click();
  await expect(page.locator('img[alt="QR Code"]')).toBeVisible({ timeout: 10_000 });

  // The stored target carries the tags (the QR itself encodes the short URL).
  const dbh = db();
  const row = dbh
    .prepare('SELECT target_url FROM qr_codes WHERE target_url LIKE ? ORDER BY id DESC LIMIT 1')
    .get('https://example.com/utm-landing%') as { target_url: string };
  dbh.close();
  expect(row.target_url).toContain('utm_source=poster');
  expect(row.target_url).toContain('utm_medium=qr');
  expect(row.target_url).toContain('utm_campaign=spring-launch');
});

test('stats endpoint returns range-filtered series with uniques and variant attribution', async ({ baseURL }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  const dbh = db();
  const qrId = (dbh.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number }).id;
  const variant = dbh
    .prepare('INSERT INTO qr_variants (qr_code_id, label, target_url, weight) VALUES (?, ?, ?, ?)')
    .run(qrId, 'v', 'https://example.com/v', 50);
  const insertScan = dbh.prepare(
    "INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class, variant_id) VALUES (?, ?, 'ua', 'NO', 'mobile', ?)"
  );
  insertScan.run(qrId, 'hash-1', null);
  insertScan.run(qrId, 'hash-1', null); // same device — unique counted once
  insertScan.run(qrId, 'hash-2', Number(variant.lastInsertRowid));
  insertScan.run(qrId, 'hash-3', null);
  dbh.close();

  const ctx = await apiRequest.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { Cookie: `auth_session=${sessionFor(userId)}` }
  });
  const res = await ctx.get(`/api/v1/qr/${shortCode}/stats`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    data: {
      totalScans: number;
      uniqueScans: number;
      hasVariants: boolean;
      byVariant: { count: number }[];
      series: { count: number; uniques: number }[];
    };
  };
  expect(body.data.uniqueScans).toBe(3);
  expect(body.data.series.length).toBeGreaterThan(0);
  expect(body.data.series[0].uniques).toBe(3);
  expect(body.data.hasVariants).toBe(true);
  expect(body.data.byVariant[0].count).toBe(1);
  await ctx.dispose();
});
