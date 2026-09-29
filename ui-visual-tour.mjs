// Visual tour of the 1.5.0 UI: seeds a realistic café/shop scenario (codes,
// campaign, 14 days of scans across countries/devices, an A/B variant), then
// captures crisp screenshots of every new screen in light + dark + mobile.
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

const BASE = 'http://127.0.0.1:5173';
const SHOTS = 'gui-test-screenshots';

// ------------------------------------------------------------------ seed
const db = new Database('./data/openqr-browser.db');
db.prepare('DELETE FROM scan_logs').run();
db.prepare('DELETE FROM qr_variants').run();
db.prepare('DELETE FROM qr_codes').run();
db.prepare('DELETE FROM campaigns').run();
db.prepare('DELETE FROM sessions').run();
db.prepare('DELETE FROM users').run();

const uid = Number(db.prepare('INSERT INTO users (email) VALUES (?)').run('demo@openqr.local').lastInsertRowid);
const campId = Number(
  db.prepare('INSERT INTO campaigns (user_id, name) VALUES (?, ?)').run(uid, 'Summer campaign').lastInsertRowid
);

const addCode = (shortCode, target, opts = {}) => {
  db.prepare(
    `INSERT INTO qr_codes (short_code, target_url, user_id, campaign_id, kind, created_at, expires_at, scan_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    shortCode, target, uid, opts.campaign ?? null, opts.kind ?? 'url',
    opts.created ?? new Date(Date.now() - (opts.ageDays ?? 10) * 86400000).toISOString().slice(0, 19).replace('T', ' '),
    opts.expires ?? null
  );
};
addCode('summer-sale', 'https://shop.birchlane.example/summer-sale', { campaign: campId, ageDays: 21 });
addCode('menu-pdf', 'https://birchlane.example/menu.pdf', { campaign: campId, ageDays: 14 });
addCode('table-tent', 'https://birchlane.example/reserve', { ageDays: 7 });
addCode('cafe-wifi', 'WIFI:T:WPA;S:Burchn Lane Guest;P:latte-2026;;', { kind: 'wifi', ageDays: 5 });
addCode('summer-sale-2', 'https://shop.birchlane.example/summer-sale?utm_source=instagram', { campaign: campId, ageDays: 3 });

// A/B variant on the summer-sale poster.
db.prepare(
  `INSERT INTO qr_variants (qr_code_id, label, target_url, weight, is_active)
   VALUES ((SELECT id FROM qr_codes WHERE short_code = 'summer-sale'), 'postcard-b',
           'https://shop.birchlane.example/summer-sale-b', 30, 1)`
).run();

// 14 days of human scans, weighted toward Norway, some on the variant.
const COUNTRIES = ['NO', 'NO', 'NO', 'NO', 'SE', 'SE', 'DK', 'DE', 'GB', 'US'];
const DEVICES = ['mobile', 'mobile', 'mobile', 'desktop', 'tablet'];
const insertScan = db.prepare(
  `INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class, variant_id, timestamp)
     VALUES (?, ?, 'ua', ?, ?, ?, ?)`
);
const bump = db.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE short_code = ?');
const codeIds = Object.fromEntries(
  db.prepare('SELECT short_code, id FROM qr_codes').all().map((r) => [r.short_code, r.id])
);
const variantId = db.prepare('SELECT id FROM qr_variants LIMIT 1').get().id;
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

for (let day = 13; day >= 0; day--) {
  // A gentle wave: busier around the campaign launch, quieter midweek.
  const perDay = 2 + Math.round(5 * Math.abs(Math.sin((13 - day) / 3.2)));
  for (let i = 0; i < perDay; i++) {
    const code = rnd() < 0.55 ? 'summer-sale' : rnd() < 0.6 ? 'menu-pdf' : 'table-tent';
    const when = new Date(Date.now() - day * 86400000 - Math.floor(rnd() * 20 + 2) * 3600000);
    const onVariant = code === 'summer-sale' && rnd() < 0.3 ? variantId : null;
    insertScan.run(
      codeIds[code], randomBytes(8).toString('hex'),
      COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      DEVICES[Math.floor(rnd() * DEVICES.length)],
      onVariant,
      when.toISOString().slice(0, 19).replace('T', ' ')
    );
    bump.run(code);
  }
}
// A few fresh scans minutes ago so the activity feed feels live.
for (const [code, country] of [['summer-sale', 'NO'], ['menu-pdf', 'SE'], ['summer-sale', 'DK']]) {
  insertScan.run(
    codeIds[code], randomBytes(8).toString('hex'), country, 'mobile', code === 'summer-sale' ? variantId : null,
    new Date(Date.now() - Math.floor(rnd() * 50 + 2) * 60000).toISOString().slice(0, 19).replace('T', ' ')
  );
  bump.run(code);
}

const sessionId = randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
  .run(sessionId, uid, new Date(Date.now() + 7200000).toISOString());
db.close();
console.log('seeded:', { codes: 5, scans: '≈80' });

// ---------------------------------------------------------------- capture
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const page = await ctx.newPage();
const shot = (name, opts = {}) => page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts });
const settle = async (ms = 1200) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };

// 1 — Landing generator with live preview
await page.goto(`${BASE}/`);
await page.locator('#target-url').fill('https://shop.birchlane.example/autumn-sale');
await page.waitForTimeout(1800);
await shot('tour-01-landing-generator');

// 2 — Dashboard: checklist + overview tiles + activity feed (full page)
await page.goto(`${BASE}/dashboard`); await settle(1800);
await shot('tour-02-dashboard-top');
await shot('tour-03-dashboard-full', { fullPage: true });

// 3 — Compact list view
await page.getByRole('button', { name: 'List view' }).click(); await settle(800);
await shot('tour-04-list-view');

// 4 — Edit page: variant editor with split bar (full page)
await page.goto(`${BASE}/dashboard/qr/summer-sale`); await settle(1800);
await shot('tour-05-edit-split-bar', { fullPage: true });

// 5 — Print sheet
await page.goto(`${BASE}/dashboard/qr/summer-sale/print`); await settle(1000);
await shot('tour-06-print-sheet');

// 6 — Stats with real multi-country data
await page.goto(`${BASE}/dashboard/qr/summer-sale/stats`); await settle(1500);
await shot('tour-07-stats', { fullPage: true });

// 7 — Static Wi-Fi /go/ page
await page.goto(`${BASE}/go/cafe-wifi`); await settle(800);
await shot('tour-08-static-go');

// 8 — Dark mode dashboard + stats
await page.goto(`${BASE}/dashboard`); await settle(1500);
await page.locator('button[aria-label*="theme"]').click(); await settle(800);
await shot('tour-09-dashboard-dark', { fullPage: true });
await page.locator('button[aria-label*="theme"]').click(); await settle(500);

// Sanity assertions (the 27-check functional pass already ran; quick re-probe)
const feed = await page.getByTestId('recent-activity').count();
await page.goto(`${BASE}/dashboard/qr/summer-sale/stats`); await settle(1200);
const bars = await page.getByTestId('by-country').locator('div[style*="width"]').count();
console.log(`sanity: activity-feed=${feed > 0 ? 'ok' : 'MISSING'}, country-bars=${bars}`);
await page.locator('button[aria-label*="theme"]').click(); await settle(700);
await shot('tour-10-stats-dark');

// 9 — Mobile: dashboard + generator
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mob.addCookies([{ name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const mp = await mob.newPage();
await mp.goto(`${BASE}/dashboard`); await mp.waitForLoadState('networkidle').catch(() => {}); await mp.waitForTimeout(1500);
await mp.screenshot({ path: `${SHOTS}/tour-11-mobile-dashboard.png` });
await mp.goto(`${BASE}/`);
await mp.locator('#target-url').fill('https://shop.birchlane.example/autumn-sale');
await mp.waitForTimeout(1500);
await mp.screenshot({ path: `${SHOTS}/tour-12-mobile-generator.png` });

await browser.close();
console.log('tour captured: 12 screenshots');
