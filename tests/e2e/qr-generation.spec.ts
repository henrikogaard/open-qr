import { test, expect, request as apiRequest } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

// Mirrors hashSecret() in src/lib/server/auth.ts so tests can seed OTP rows.
function otpHash(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(code, salt, 120_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function seedOtp(email: string, code = '123456'): void {
  const dbh = db();
  dbh.prepare('DELETE FROM users WHERE email = ?').run(email);
  dbh.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)').run(
    email,
    otpHash(code),
    new Date(Date.now() + 10 * 60_000).toISOString()
  );
  dbh.close();
}

function promoteAdmin(userId: number): void {
  const dbh = db();
  dbh.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
  dbh.close();
}

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

test('API responses never expose password_hash', async ({ baseURL }) => {
  const { sessionId } = createUserSession(uniqueEmail('sanit'));
  const authed = await authedContext(sessionId, baseURL!);

  const created = await authed.post('/api/v1/qr', {
    data: { targetUrl: 'https://example.com/secret', password: 'hunter2' }
  });
  expect(created.ok()).toBeTruthy();
  const { data } = (await created.json()) as { success: boolean; data: { shortCode: string } };
  expect(JSON.stringify(created)).not.toContain('password_hash');

  for (const url of [`/api/v1/qr/${data.shortCode}`, '/api/v1/qr']) {
    const res = await authed.get(url);
    expect(res.ok()).toBeTruthy();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('hunter2');
  }

  await authed.dispose();
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

test('OTP send rejects requests without a solved captcha', async ({ request }) => {
  const response = await request.post('/api/v1/auth/otp/send', {
    data: { email: uniqueEmail('nocaptcha') }
  });
  expect(response.status()).toBe(400);
  const body = (await response.json()) as { message?: string };
  expect(body.message).toContain('Captcha');
});

test('OTP send accepts a solved proof-of-work challenge', async ({ request }) => {
  const challengeRes = await request.get('/api/v1/auth/captcha');
  const challenge = (await challengeRes.json()) as {
    success: boolean;
    data: { payload: string; salt: string; challenge: string; maxnumber: number };
  };
  expect(challenge.success).toBe(true);

  let solution = -1;
  for (let n = 0; n < challenge.data.maxnumber; n++) {
    if (createHash('sha256').update(challenge.data.salt + n).digest('hex') === challenge.data.challenge) {
      solution = n;
      break;
    }
  }
  expect(solution).toBeGreaterThanOrEqual(0);

  const email = uniqueEmail('captcha');
  const sent = await request.post('/api/v1/auth/otp/send', {
    data: { email, captcha: { payload: challenge.data.payload, number: solution } }
  });
  expect(sent.status()).toBe(200);

  // Account must not exist until the code is verified.
  const dbh = db();
  const user = dbh.prepare('SELECT id FROM users WHERE email = ?').get(email);
  dbh.close();
  expect(user).toBeUndefined();
});

test('login page solves the proof-of-work in the browser and reaches verify', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', uniqueEmail('pow'));
  await page.click('button[type="submit"]');
  await page.waitForURL(/verify-otp\?email=/, { timeout: 30_000 });
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

test('OTP verify issues a working session; wrong codes are rejected', async ({ request }) => {
  const email = uniqueEmail('login');
  seedOtp(email);

  const wrong = await request.post('/api/v1/auth/otp/verify', { data: { email, code: '000000' } });
  expect(wrong.status()).toBe(400);

  const res = await request.post('/api/v1/auth/otp/verify', {
    data: { email, code: '123456' },
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605' }
  });
  expect(res.ok()).toBeTruthy();

  // The request context keeps the session cookie — /me should resolve.
  const me = await request.get('/api/v1/auth/me');
  const meBody = (await me.json()) as { data: { email: string } | null };
  expect(meBody.data?.email).toBe(email);

  // Account created only at verify time.
  const dbh = db();
  const user = dbh.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number };
  const session = dbh
    .prepare('SELECT user_agent FROM sessions WHERE user_id = ?')
    .get(user.id) as { user_agent: string };
  dbh.close();
  expect(session.user_agent).toContain('iPhone');
});

test('logout invalidates the session', async ({ request }) => {
  const email = uniqueEmail('logout');
  seedOtp(email);
  const res = await request.post('/api/v1/auth/otp/verify', { data: { email, code: '123456' } });
  expect(res.ok()).toBeTruthy();

  const out = await request.post('/api/v1/auth/logout');
  expect(out.ok()).toBeTruthy();

  const me = await request.get('/api/v1/auth/me');
  const meBody = (await me.json()) as { data: unknown };
  expect(meBody.data).toBeNull();
});

test('session list shows current device; DELETE logs out everywhere', async ({ request }) => {
  const email = uniqueEmail('sessions');
  seedOtp(email);
  expect((await request.post('/api/v1/auth/otp/verify', { data: { email, code: '123456' } })).ok()).toBe(true);

  const list = await request.get('/api/v1/auth/sessions');
  const body = (await list.json()) as { data: { current: boolean; deviceClass: string }[] };
  expect(list.ok()).toBeTruthy();
  expect(body.data.length).toBe(1);
  expect(body.data[0]!.current).toBe(true);

  const gone = await request.delete('/api/v1/auth/sessions');
  expect(gone.ok()).toBeTruthy();

  const me = await request.get('/api/v1/auth/me');
  expect(((await me.json()) as { data: unknown }).data).toBeNull();
});

test('admin endpoints reject non-admins and serve admins', async ({ baseURL }) => {
  const admin = createUserSession(uniqueEmail('admin'));
  promoteAdmin(admin.userId);
  const pleb = createUserSession(uniqueEmail('pleb'));

  const adminCtx = await authedContext(admin.sessionId, baseURL!);
  const plebCtx = await authedContext(pleb.sessionId, baseURL!);

  expect((await adminCtx.get('/api/v1/admin/settings')).ok()).toBe(true);
  expect((await plebCtx.get('/api/v1/admin/settings')).status()).toBe(403);

  await adminCtx.dispose();
  await plebCtx.dispose();
});

test('anonymous QR creations are claimable and adoptable after login', async ({ request }) => {
  // Anonymous create — the context stores the claim cookie.
  const created = await request.post('/api/v1/qr', { data: { targetUrl: 'https://example.com/claim-me' } });
  expect(created.ok()).toBeTruthy();
  const setCookie = created.headers()['set-cookie'] ?? '';
  const match = /openqr_claims=([0-9a-f]+)/.exec(setCookie);
  expect(match).not.toBeNull();
  const claimToken = match![1];

  const { data } = (await created.json()) as { data: { shortCode: string } };
  const dbh = db();
  const row = dbh.prepare('SELECT user_id, claim_token FROM qr_codes WHERE short_code = ?').get(data.shortCode) as {
    user_id: number | null;
    claim_token: string | null;
  };
  expect(row.user_id).toBeNull();
  expect(row.claim_token).not.toBeNull();
  dbh.close();

  // A user logged in with that browser cookie adopts the code.
  const { sessionId } = createUserSession(uniqueEmail('adopter'));
  const adopt = await request.post('/api/v1/qr/adopt', {
    headers: { cookie: `auth_session=${sessionId}; openqr_claims=${claimToken}` }
  });
  const adoptBody = (await adopt.json()) as { data: { adopted: number } };
  expect(adoptBody.data.adopted).toBeGreaterThanOrEqual(1);

  const dbh2 = db();
  const after = dbh2.prepare('SELECT user_id FROM qr_codes WHERE short_code = ?').get(data.shortCode) as {
    user_id: number | null;
  };
  dbh2.close();
  expect(after.user_id).not.toBeNull();
});

test('CSV export returns the user\'s codes and scans', async ({ baseURL }) => {
  const { sessionId } = createUserSession(uniqueEmail('export'));
  const dbh = db();
  const { user_id } = dbh.prepare('SELECT id as user_id FROM users ORDER BY id DESC LIMIT 1').get() as { user_id: number };
  dbh.prepare('INSERT INTO qr_codes (short_code, target_url, user_id) VALUES (?, ?, ?)').run(
    'export01',
    'https://example.com/export',
    user_id
  );
  const qrId = dbh.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get('export01') as { id: number };
  dbh.prepare('INSERT INTO scan_logs (qr_code_id, ip_hash, country, device_class) VALUES (?, ?, ?, ?)').run(
    qrId.id,
    'ff00',
    'DK',
    'mobile'
  );
  dbh.close();

  const ctx = await authedContext(sessionId, baseURL!);
  const codes = await ctx.get('/api/v1/export?type=codes');
  expect(codes.ok()).toBeTruthy();
  expect(codes.headers()['content-type']).toContain('text/csv');
  const codesCsv = await codes.text();
  expect(codesCsv).toContain('short_code');
  expect(codesCsv).toContain('export01');

  const scans = await ctx.get('/api/v1/export?type=scans');
  const scansCsv = await scans.text();
  expect(scansCsv).toContain('export01');
  expect(scansCsv).toContain('DK');

  await ctx.dispose();
});
