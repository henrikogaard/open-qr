import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

// Coverage for the 1.5.0 UI polish pass: dashboard overview + activity feed,
// the first-run checklist, the variant split bar, the print sheet, and the
// proportion bars on the stats page. Auth is a directly seeded session cookie
// (same pattern as qr-generation.spec.ts).

function db(): Database.Database {
  return new Database(process.env.DATABASE_URL || './data/openqr.db');
}

function seedUser(): number {
  const dbh = db();
  const result = dbh
    .prepare('INSERT INTO users (email) VALUES (?)')
    .run(`${randomBytes(4).toString('hex')}@polish.test`);
  dbh.close();
  return Number(result.lastInsertRowid);
}

function seedQr(userId: number, overrides: Record<string, unknown> = {}): string {
  const shortCode = randomBytes(5).toString('base64url');
  const dbh = db();
  dbh
    .prepare('INSERT INTO qr_codes (short_code, target_url, user_id) VALUES (?, ?, ?)')
    .run(shortCode, 'https://example.com/polish', userId);
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

function seedSession(userId: number): string {
  const sessionId = randomBytes(32).toString('hex');
  const dbh = db();
  dbh
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, new Date(Date.now() + 60 * 60 * 1000).toISOString());
  dbh.close();
  return sessionId;
}

function seedScan(
  shortCode: string,
  opts: { country?: string | null; deviceClass?: string | null } = {}
): void {
  const { country = null, deviceClass = 'mobile' } = opts;
  const dbh = db();
  dbh
    .prepare(
      `INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class, timestamp)
       VALUES (
         (SELECT id FROM qr_codes WHERE short_code = ?), ?, 'ua', ?, ?,
         datetime('now', '-5 minutes')
       )`
    )
    .run(shortCode, randomBytes(8).toString('hex'), country, deviceClass);
  dbh.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE short_code = ?').run(shortCode);
  dbh.close();
}

async function login(page: import('@playwright/test').Page, sessionId: string): Promise<void> {
  await page.context().addCookies([
    { name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }
  ]);
}

test('dashboard shows overview tiles and the recent activity feed (bots excluded)', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);
  seedScan(shortCode, { country: 'NO', deviceClass: 'mobile' });
  seedScan(shortCode, { country: 'SE', deviceClass: 'bot' });

  await login(page, seedSession(userId));
  await page.goto('/dashboard');

  await expect(page.getByText('All-time scans')).toBeVisible();
  await expect(page.getByText('Scans · 7 days')).toBeVisible();
  // One human scan: the bot hit must not appear in tiles or feed.
  const activity = page.getByTestId('recent-activity');
  await expect(activity).toBeVisible();
  await expect(activity.getByRole('link', { name: `/go/${shortCode}` })).toBeVisible();
  await expect(activity.getByText('NO')).toBeVisible();
  await expect(activity.getByText('SE')).toHaveCount(0);
});

test('first-run checklist appears, then stays dismissed', async ({ page }) => {
  const userId = seedUser();
  seedQr(userId); // step 1 done, steps 2-4 pending → checklist visible

  await login(page, seedSession(userId));
  await page.goto('/dashboard');

  const checklist = page.getByTestId('onboarding');
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText('Test it — scan with your phone or open its short URL')).toBeVisible();
  await checklist.getByRole('button', { name: 'Dismiss' }).click();
  await expect(checklist).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
});

test('dashboard list view renders a compact table with actions', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  await login(page, seedSession(userId));
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'List view' }).click();
  const table = page.locator('table').filter({ hasText: shortCode });
  await expect(table.getByRole('link', { name: 'Stats' })).toBeVisible();
  await expect(table.getByText('https://example.com/polish')).toBeVisible();
});

test('variant split bar shows weights and the main-URL fallback share', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);
  const dbh = db();
  dbh
    .prepare(
      `INSERT INTO qr_variants (qr_code_id, label, target_url, weight, is_active)
       VALUES ((SELECT id FROM qr_codes WHERE short_code = ?), 'postcard-b', 'https://example.com/b', 30, 1)`
    )
    .run(shortCode);
  dbh.close();

  await login(page, seedSession(userId));
  await page.goto(`/dashboard/qr/${shortCode}`);

  const split = page.getByTestId('split-bar');
  await expect(split).toBeVisible();
  await expect(split.getByText('postcard-b')).toBeVisible();
  await expect(split.getByText('30%')).toBeVisible();
  await expect(split.getByText('Main URL (fallback)')).toBeVisible();
  await expect(split.getByText('70%')).toBeVisible();
});

test('print sheet renders the QR with size options and caption', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);

  await login(page, seedSession(userId));
  await page.goto(`/dashboard/qr/${shortCode}/print`);

  await expect(page.getByRole('heading', { name: `/go/${shortCode}` })).toBeVisible();
  const qr = page.locator('.qr-img');
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute('src')).toContain('format=svg');
  await expect(page.getByRole('button', { name: '30 mm' })).toBeVisible();
  await expect(page.getByText('Scan with your phone camera')).toBeVisible();
});

test('stats page draws proportion bars for country and device breakdowns', async ({ page }) => {
  const userId = seedUser();
  const shortCode = seedQr(userId);
  seedScan(shortCode, { country: 'NO', deviceClass: 'mobile' });
  seedScan(shortCode, { country: 'NO', deviceClass: 'mobile' });
  seedScan(shortCode, { country: 'DE', deviceClass: 'desktop' });

  await login(page, seedSession(userId));
  await page.goto(`/dashboard/qr/${shortCode}/stats`);

  const countries = page.getByTestId('by-country');
  await expect(countries.getByText('NO').first()).toBeVisible();
  // Two countries logged → two proportion bars, NO (2 scans) wider than DE (1).
  const bars = countries.locator('div[style*="width"]');
  await expect(bars.first()).toBeVisible();
  expect(await bars.count()).toBeGreaterThanOrEqual(2);
});
