import { test, expect, request as apiRequest } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

function db() {
  return new Database(process.env.DATABASE_URL || './data/openqr.db');
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@example.test`;
}

function createUserSession(email: string): { userId: number; sessionId: string } {
  const database = db();
  database.prepare('DELETE FROM users WHERE email = ?').run(email);
  const userResult = database.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  const userId = Number(userResult.lastInsertRowid);
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  database
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, expiresAt);
  database.close();
  return { userId, sessionId };
}

function createAuthenticatedQRCode(email: string, targetUrl: string) {
  const { userId, sessionId } = createUserSession(email);
  const database = db();
  const shortCode = randomBytes(5).toString('base64url');
  database
    .prepare('INSERT INTO qr_codes (short_code, target_url, user_id) VALUES (?, ?, ?)')
    .run(shortCode, targetUrl, userId);
  database.close();
  return { sessionId, shortCode, userId };
}

async function authedContext(sessionId: string, baseURL: string) {
  const ctx = await apiRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Cookie: `auth_session=${sessionId}` }
  });
  return ctx;
}

test('homepage has title and QR generator', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Open-QR/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('QR codes');
  await expect(page.locator('input[type="url"]')).toBeVisible();
});

test('live preview renders without clicking generate', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.fill('input[type="url"]', 'https://example.com');
  await expect(page.locator('img[alt="QR Code"]')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: 'PNG' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'SVG' })).toBeVisible();
});

test('persisted QR exposes a short URL', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.fill('input[type="url"]', 'https://example.com/persist-test');
  await page.getByRole('button', { name: 'Generate QR code' }).click();
  await expect(page.locator('a[href*="/go/"]').first()).toBeVisible({ timeout: 10000 });
});

test('terms gate blocks generation until accepted', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[type="url"]', 'https://example.com/terms-gate');
  // Button should be disabled until consent
  const button = page.getByRole('button', { name: 'Generate QR code' });
  await expect(button).toBeDisabled();
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await expect(button).toBeEnabled();
});

test('/terms page renders', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Terms of Use');
  await expect(page.getByText(/Child sexual abuse material/)).toBeVisible();
});

test('dashboard edit page loads with current values', async ({ page }) => {
  const { sessionId, shortCode } = createAuthenticatedQRCode(
    uniqueEmail('editor'),
    'https://example.com/edit-me'
  );
  await page.context().addCookies([
    { name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }
  ]);

  await page.goto(`/dashboard/qr/${shortCode}`);
  await expect(page.getByRole('heading', { name: 'Update settings' })).toBeVisible();
  await expect(page.getByLabel('Target URL')).toHaveValue('https://example.com/edit-me');
});

test('login page is reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test('API key issuance — Bearer works, revoke kills it', async ({ baseURL }) => {
  const { sessionId } = createUserSession(uniqueEmail('keys'));
  const authed = await authedContext(sessionId, baseURL!);

  // Issue
  const issueRes = await authed.post('/api/v1/keys', {
    data: { name: 'e2e bearer test' },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(issueRes.ok()).toBeTruthy();
  const issued = (await issueRes.json()) as { success: boolean; data: { id: number; token: string } };
  expect(issued.data.token).toMatch(/^oqk_[a-f0-9]{48}$/);

  // Use the list endpoint to verify Bearer auth: it requires auth (401 when
  // anonymous), so a 200 proves the token resolved to the right user.
  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  const bearerRes = await anon.get('/api/v1/qr', {
    headers: { Authorization: `Bearer ${issued.data.token}` }
  });
  expect(bearerRes.status()).toBe(200);

  // Sanity check: no auth header → 401
  const noAuth = await anon.get('/api/v1/qr');
  expect(noAuth.status()).toBe(401);

  // Revoke
  const delRes = await authed.delete(`/api/v1/keys/${issued.data.id}`);
  expect(delRes.ok()).toBeTruthy();

  // Revoked token no longer authenticates → 401
  const rejected = await anon.get('/api/v1/qr', {
    headers: { Authorization: `Bearer ${issued.data.token}` }
  });
  expect(rejected.status()).toBe(401);
});

test('bulk CSV import — partial success surfaces errors', async ({ baseURL }) => {
  const { sessionId } = createUserSession(uniqueEmail('bulk'));
  const authed = await authedContext(sessionId, baseURL!);

  const csv = [
    'targetUrl,template,foregroundColor',
    'https://example.com/bulk-ok,default,#000000',
    'https://bit.ly/shortener,default,#000000',
    ',default,#000000',
    'https://example.com/bulk-ok-2,rounded,#1a73e8'
  ].join('\n');

  const res = await authed.post('/api/v1/qr/bulk', {
    data: csv,
    headers: { 'Content-Type': 'text/csv' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data.created).toBe(2);
  expect(body.data.failed).toBe(2);
  expect(body.data.results.map((r: any) => r.success)).toEqual([true, false, false, true]);
  expect(body.data.results[1].error).toMatch(/blocked/i);
  expect(body.data.results[2].error).toMatch(/empty/i);
});

test('scanning /go logs country and device class from headers', async ({ baseURL }) => {
  const { shortCode, userId } = createAuthenticatedQRCode(
    uniqueEmail('scan'),
    'https://example.com/scan-target'
  );

  const anon = await apiRequest.newContext({ baseURL: baseURL! });
  const res = await anon.get(`/go/${shortCode}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'CF-IPCountry': 'NO',
      'X-Forwarded-For': '198.51.100.7'
    },
    maxRedirects: 0
  });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toBe('https://example.com/scan-target');

  const database = db();
  const row = database
    .prepare(
      `SELECT sl.country, sl.device_class FROM scan_logs sl
       JOIN qr_codes qc ON qc.id = sl.qr_code_id
       WHERE qc.short_code = ?`
    )
    .get(shortCode) as { country: string; device_class: string } | undefined;
  database.close();
  expect(row?.country).toBe('NO');
  expect(row?.device_class).toBe('mobile');

  // Cleanup so the user count stays clean for parallel test runs.
  const cleanup = db();
  cleanup.prepare('DELETE FROM scan_logs WHERE qr_code_id IN (SELECT id FROM qr_codes WHERE user_id = ?)').run(userId);
  cleanup.prepare('DELETE FROM qr_codes WHERE user_id = ?').run(userId);
  cleanup.close();
});
