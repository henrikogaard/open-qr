// Browser regression for the 1.5.0 UI-polish pass. Real flows in headless
// Chromium against the dev server: OTP login, draft persistence, ⌘/Ctrl+Enter,
// dashboard overview/checklist/sort/list/load-more, split bar, print sheet,
// stats bars + tooltip, dark mode, admin, and a mobile viewport pass.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const DEV_LOG = '/tmp/openqr-browser-dev.log';
const SHOTS = 'gui-test-screenshots';
const EMAIL = `ui-tester-${Date.now()}@example.com`;

const checks = [];
/** @param {string} id @param {string} name @param {boolean} pass @param {string} [detail] */
function check(id, name, pass, detail = '') {
  checks.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const consoleErrors = [];
const qrPosts = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.url().includes('/api/v1/qr') && r.request().method() === 'POST' && !r.url().includes('preview=1')) qrPosts.push(r.status());
});

const fs = await import('node:fs');

// The harness drives the UI faster than any human (live previews, bulk
// creates, dashboard fetches) and would trip the default 60/min API rate
// limit mid-flow. The harness owns this DB, so raise the ceiling up front.
{
  const Database = (await import('better-sqlite3')).default;
  const db = new Database('./data/openqr-browser.db');
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('RATE_LIMIT_PER_MINUTE', '1000')").run();
  db.close();
}

/** Latest OTP mailed to EMAIL, parsed from the dev-server log. */
function otpFromLog() {
  const log = fs.readFileSync(DEV_LOG, 'utf8');
  const at = log.lastIndexOf(EMAIL);
  if (at === -1) return null;
  const m = log.slice(at, at + 2000).match(/verification code is: (\d{6})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- T1 login
await page.goto(`${BASE}/login`);
await page.fill('#email', EMAIL);
await page.getByRole('button', { name: 'Send code' }).click();
// The proof-of-work check runs in the browser first; give it room.
await page.waitForURL(/verify-otp/, { timeout: 60000 });
let otp = null;
for (let i = 0; i < 20 && !otp; i++) { otp = otpFromLog(); if (!otp) await page.waitForTimeout(500); }
check('t01', 'OTP arrives in dev log', !!otp);
await page.fill('#code', otp || '000000');
await page.getByRole('button', { name: /verify/i }).click();
await page.waitForURL(/dashboard/, { timeout: 20000 });
check('t02', 'login reaches dashboard', page.url().includes('/dashboard'));

// ------------------------------------------------- T2 onboarding checklist
const onboarding = page.getByTestId('onboarding');
await onboarding.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
check('t03', 'first-run checklist visible', await onboarding.count() > 0 && await onboarding.isVisible());
await page.screenshot({ path: `${SHOTS}/v2-01-dashboard-checklist.png` });
if (await onboarding.count()) {
  await onboarding.getByRole('button', { name: 'Dismiss' }).click();
  await page.waitForTimeout(300);
  check('t04', 'checklist dismisses', (await page.getByTestId('onboarding').count()) === 0);
  await page.reload(); await page.waitForTimeout(800);
  check('t05', 'dismissal survives reload', (await page.getByTestId('onboarding').count()) === 0);
}

// ------------------------------------------------ T3 draft persistence + ⌘⏎
await page.goto(`${BASE}/`);
await page.locator('#target-url').fill('https://example.com/draft-test');
// Terms checkbox: arm the response listener first — if the first check()
// lands before hydration attaches the handler, re-check once it settles.
{
  const accepted = () => page.waitForResponse((r) => r.url().includes('/accept-terms'), { timeout: 4000 }).catch(() => null);
  if (await page.locator('#terms-accept').count()) {
    let resp = await accepted();
    await page.locator('#terms-accept').check();
    if (!resp) {
      resp = await accepted();
      if (!resp) await page.locator('#terms-accept').check().catch(() => {});
    }
  }
}
await page.waitForTimeout(400);
await page.reload(); await page.waitForTimeout(600);
const restored = await page.locator('#target-url').inputValue();
check('t06', 'draft survives reload', restored === 'https://example.com/draft-test', `got "${restored}"`);
// Terms acceptance, end to end: the agreement line always renders while a
// terms version exists; acceptance means it comes back CHECKED after a
// reload and generation stays enabled (the gate is needsTerms, enforced on
// the Generate button).
{
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/v1/auth/accept-terms', { method: 'POST' });
    return res.status;
  });
  await page.reload();
  await page.locator('#terms-accept').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500); // let hydration apply the checked state
  const box = page.locator('#terms-accept');
  const checked = (await box.count()) > 0 && (await box.isChecked());
  const genEnabled = await page.getByRole('button', { name: 'Generate QR code' }).isEnabled();
  check('t06b', 'terms acceptance persists (checked + ungated after reload)', r === 200 && checked && genEnabled,
    `POST ${r}, checked ${checked}, generate enabled ${genEnabled}`);
}
await page.screenshot({ path: `${SHOTS}/v2-02-draft-restored.png` });

await page.getByRole('button', { name: 'Clear form' }).click();
check('t07', 'Clear form empties the field', (await page.locator('#target-url').inputValue()) === '');

await page.locator('#target-url').fill('https://example.com/cmd-enter');
await page.locator('#target-url').click();
await page.keyboard.press('Control+Enter');
const shortUrlAside = page.locator('aside').getByText('Short URL');
await shortUrlAside.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
const errText = await page.locator('.alert-danger').innerText().catch(() => '');
check('t08', 'Ctrl+Enter generates the QR', await shortUrlAside.count() > 0,
  !await shortUrlAside.count() ? `posts=${JSON.stringify(qrPosts)} error="${errText}"` : '');
const href = await page.locator('aside a[href*="/go/"]').first().getAttribute('href').catch(() => null);
const codeMatch = href ? href.match(/\/go\/([A-Za-z0-9_-]+)/) : null;
const mainCode = codeMatch ? codeMatch[1] : null;
check('t09', 'generated code captured', !!mainCode, mainCode || 'not found');

// ------------------------------------------- T4 dashboard overview + feed
await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(1200);
check('t10', 'overview tiles render', await page.getByText('All-time scans').count() > 0 && await page.getByText('Scans · 7 days').count() > 0);
// Scan our own code twice through the redirector so the feed has rows.
if (mainCode) {
  await page.goto(`${BASE}/go/${mainCode}`); await page.waitForTimeout(600);
  await page.goto(`${BASE}/go/${mainCode}`); await page.waitForTimeout(600);
}
await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(1200);
const feed = page.getByTestId('recent-activity');
check('t11', 'activity feed lists the scan', (await feed.count()) > 0 && (await feed.getByText(`/go/${mainCode}`).count()) > 0);
await page.screenshot({ path: `${SHOTS}/v2-03-dashboard-overview.png` });

// --------------------------------------------- T5 sort + list view + more
// Bulk-create codes via the API so pagination has something to do.
if (mainCode) {
  for (let i = 0; i < 14; i++) {
    await page.evaluate(async (n) => {
      await fetch('/api/v1/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: `https://example.com/bulk-${n}` })
      });
    }, i);
  }
}
await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(1500);
const cardsBefore = await page.locator('article.card').count();
check('t12', 'grid paginates at 12', cardsBefore === 12, `got ${cardsBefore}`);
const loadMore = page.getByRole('button', { name: /load more/i });
if (await loadMore.count()) await loadMore.click();
await page.waitForTimeout(400);
const cardsAfter = await page.locator('article.card').count();
check('t13', 'Load more expands the grid', cardsAfter > 12, `got ${cardsAfter}`);

await page.locator('#sort-by').selectOption('alpha'); await page.waitForTimeout(400);
if (await page.locator('article.card h3').count() === 0) {
  check('t14', 'A–Z sort reorders', false, 'no cards rendered');
} else {
  const firstCard = await page.locator('article.card h3').first().textContent();
  check('t14', 'A–Z sort reorders', firstCard.includes('bulk-0'), firstCard?.trim());
}

await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(500);
const listTable = page.locator('table').filter({ hasText: 'Destination' });
check('t15', 'compact list view renders', (await listTable.count()) > 0 && (await listTable.getByRole('link', { name: 'Stats' }).count()) > 0);
await page.screenshot({ path: `${SHOTS}/v2-04-list-view.png` });

// ------------------------------------------------------- T6 variant split
await page.goto(`${BASE}/dashboard/qr/${mainCode}`); await page.waitForTimeout(800);
const openVariants = page.getByRole('button', { name: /alternative targets/i });
if (await openVariants.count()) await openVariants.click();
await page.getByRole('button', { name: /add variant/i }).click();
await page.locator('#variant-url-0').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('#variant-url-0').fill('https://example.com/variant-b');
await page.locator('#variant-weight-0').fill('30');
await page.waitForTimeout(400);
const split = page.getByTestId('split-bar');
check('t16', 'split bar live-updates (30/70)', (await split.count()) > 0 && (await split.getByText('30%').count()) > 0 && (await split.getByText('70%').count()) > 0);
await page.screenshot({ path: `${SHOTS}/v2-05-split-bar.png` });
const openDest = page.getByRole('link', { name: 'Open destination' });
check('t17', 'Open destination link present', (await openDest.count()) > 0 && (await openDest.first().getAttribute('href')) === 'https://example.com/cmd-enter');

// ---------------------------------------------------------- T7 print sheet
await page.goto(`${BASE}/dashboard/qr/${mainCode}/print`); await page.waitForTimeout(600);
const qrImg = page.locator('.qr-img');
check('t18', 'print sheet renders SVG QR', (await qrImg.count()) > 0 && (await qrImg.getAttribute('src')).includes('format=svg'));
const wrapWidthBefore = await page.evaluate(() => document.querySelector('.qr-img')?.parentElement?.style?.width);
await page.getByRole('button', { name: '50 mm' }).click();
const wrapWidthAfter = await page.evaluate(() => document.querySelector('.qr-img')?.parentElement?.style?.width);
check('t19', 'size buttons change physical size', wrapWidthBefore === '30mm' && wrapWidthAfter === '50mm', `${wrapWidthBefore} → ${wrapWidthAfter}`);
check('t20', 'caption shows short URL', await page.getByText('Scan with your phone camera').count() > 0);
await page.screenshot({ path: `${SHOTS}/v2-06-print-sheet.png` });

// ------------------------------------------------- T8 stats bars + tooltip
await page.goto(`${BASE}/dashboard/qr/${mainCode}/stats`); await page.waitForTimeout(1000);
// Localhost scans carry no country (no geo headers) — the country card must
// show its empty state, while device classes come from the UA and do chart.
const countryCard = page.getByTestId('by-country');
check('t21a', 'country card handles no-data state', (await countryCard.getByText(/no country data/i).count()) > 0);
const deviceCard = page.getByTestId('by-device');
check('t21b', 'device breakdown bars render', (await deviceCard.locator('div[style*="width"]').count()) > 0);
const tooltip = page.locator('[role="tooltip"]').first();
if (await tooltip.count()) {
  await page.locator('div[style*="width"]').first().hover(); await page.waitForTimeout(300);
  const opacity = await tooltip.evaluate((el) => getComputedStyle(el).opacity);
  check('t22', 'series tooltip appears on hover', opacity === '1', `opacity ${opacity}`);
} else {
  check('t22', 'series tooltip appears on hover', false, 'no tooltip element');
}
await page.screenshot({ path: `${SHOTS}/v2-07-stats-bars.png` });

// ------------------------------------------------------------ T9 dark mode
await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(800);
const themeBtn = page.locator('button[aria-label*="theme"]');
const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
await themeBtn.click(); await page.waitForTimeout(400);
const isDarkNow = await page.evaluate(() => document.documentElement.classList.contains('dark'));
check('t23', 'theme toggle flips .dark', isDarkNow !== wasDark, `${wasDark} → ${isDarkNow}`);
await page.screenshot({ path: `${SHOTS}/v2-08-dashboard-dark.png` });

// ----------------------------------------------------------- T10 admin page
// The rate limiter and login bursts make this user non-admin (only the first
// account in a fresh DB gets it) — promote directly, as this harness owns the DB.
{
  const Database = (await import('better-sqlite3')).default;
  const db = new Database('./data/openqr-browser.db');
  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(EMAIL);
  db.close();
}
await page.goto(`${BASE}/admin`); await page.waitForTimeout(1500);
check('t24', 'admin tabs render after loading state', await page.getByRole('button', { name: 'Settings' }).count() > 0);

// -------------------------------------------------------- T11 mobile check
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto(`${BASE}/dashboard`); await mobile.waitForTimeout(1500);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('t25', 'mobile: no horizontal overflow', overflow <= 1, `overflow ${overflow}px`);
await mobile.screenshot({ path: `${SHOTS}/v2-09-mobile-dashboard.png` });
await mobile.close();

await browser.close();

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.id).join(', ')); }
console.log(`console errors (${consoleErrors.length}):`);
for (const e of consoleErrors) console.log('  ' + e.slice(0, 200));
