// Regenerates docs/screenshots/*.png against a seeded dev server. Run:
//   DATABASE_URL=./data/openqr-docs.db node scripts/docs-screenshots.mjs
// (start the dev server on :5173 with the same DATABASE_URL first)
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'docs/screenshots';

const db = new Database(process.env.DATABASE_URL || './data/openqr-docs.db');
db.prepare('DELETE FROM scan_logs').run();
db.prepare('DELETE FROM qr_variants').run();
db.prepare('DELETE FROM qr_codes').run();
db.prepare('DELETE FROM campaigns').run();
db.prepare('DELETE FROM sessions').run();
db.prepare('DELETE FROM users').run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('RATE_LIMIT_PER_MINUTE', '1000')").run();

const uid = Number(
  db.prepare('INSERT INTO users (email, is_admin) VALUES (?, 1)').run('demo@openqr.local').lastInsertRowid
);
const campId = Number(db.prepare('INSERT INTO campaigns (user_id, name) VALUES (?, ?)').run(uid, 'Summer campaign').lastInsertRowid);

const addCode = (code, target, opts = {}) => {
  db.prepare(
    `INSERT INTO qr_codes (short_code, target_url, user_id, campaign_id, kind, created_at, scan_count)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(code, target, uid, opts.campaign ?? null, opts.kind ?? 'url', new Date(Date.now() - (opts.ageDays ?? 10) * 86400000).toISOString().slice(0, 19).replace('T', ' '));
};
addCode('summer-sale', 'https://shop.birchlane.example/summer-sale', { campaign: campId, ageDays: 21 });
addCode('menu-pdf', 'https://birchlane.example/menu.pdf', { campaign: campId, ageDays: 14 });
addCode('table-tent', 'https://birchlane.example/reserve', { ageDays: 7 });
addCode('cafe-wifi', 'WIFI:T:WPA;S:Burchn Lane Guest;P:latte-2026;;', { kind: 'wifi', ageDays: 5 });

db.prepare(
  `INSERT INTO qr_variants (qr_code_id, label, target_url, weight, is_active)
   VALUES ((SELECT id FROM qr_codes WHERE short_code = 'summer-sale'), 'postcard-b',
           'https://shop.birchlane.example/summer-sale-b', 30, 1)`
).run();

const insertScan = db.prepare(
  `INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class, variant_id, timestamp)
     VALUES (?, ?, 'ua', ?, ?, ?, ?)`
);
const bump = db.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE short_code = ?');
const ids = Object.fromEntries(db.prepare('SELECT short_code, id FROM qr_codes').all().map((r) => [r.short_code, r.id]));
const vid = db.prepare('SELECT id FROM qr_variants LIMIT 1').get().id;
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const COUNTRIES = ['NO', 'NO', 'NO', 'SE', 'DK', 'DE', 'GB', 'US'];
const DEVICES = ['mobile', 'mobile', 'mobile', 'desktop', 'tablet'];
for (let day = 13; day >= 0; day--) {
  const perDay = 2 + Math.round(5 * Math.abs(Math.sin((13 - day) / 3.2)));
  for (let i = 0; i < perDay; i++) {
    const code = rnd() < 0.6 ? 'summer-sale' : rnd() < 0.6 ? 'menu-pdf' : 'table-tent';
    insertScan.run(
      ids[code], randomBytes(8).toString('hex'),
      COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      DEVICES[Math.floor(rnd() * DEVICES.length)],
      code === 'summer-sale' && rnd() < 0.3 ? vid : null,
      new Date(Date.now() - day * 86400000 - Math.floor(rnd() * 20 + 2) * 3600000).toISOString().slice(0, 19).replace('T', ' ')
    );
    bump.run(code);
  }
}
for (const [code, country] of [['summer-sale', 'NO'], ['menu-pdf', 'SE'], ['summer-sale', 'DK']]) {
  insertScan.run(ids[code], randomBytes(8).toString('hex'), country, 'mobile', code === 'summer-sale' ? vid : null,
    new Date(Date.now() - Math.floor(rnd() * 40 + 2) * 60000).toISOString().slice(0, 19).replace('T', ' '));
  bump.run(code);
}

const sessionId = randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
  .run(createHash('sha256').update(sessionId).digest('hex'), uid, new Date(Date.now() + 7200000).toISOString());
db.close();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const page = await ctx.newPage();
const settle = async (ms = 1200) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };

await page.goto(`${BASE}/`);
await page.locator('#target-url').fill('https://shop.birchlane.example/autumn-sale');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/01-generator.png` });

await page.goto(`${BASE}/dashboard`); await settle(1800);
await page.screenshot({ path: `${OUT}/02-dashboard.png` });

await page.goto(`${BASE}/dashboard/qr/summer-sale/stats`); await settle(1500);
await page.screenshot({ path: `${OUT}/03-qr-stats.png` });

await page.goto(`${BASE}/admin`); await settle(1500);
await page.screenshot({ path: `${OUT}/04-admin-settings.png` });
await page.getByRole('button', { name: 'Privacy' }).click(); await settle(1000);
await page.screenshot({ path: `${OUT}/05-admin-privacy.png` });

await page.goto(`${BASE}/report/summer-sale`); await settle(800);
await page.screenshot({ path: `${OUT}/06-report.png` });

await page.goto(`${BASE}/status`); await settle(800);
await page.screenshot({ path: `${OUT}/07-status.png` });

const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mob.addCookies([{ name: 'auth_session', value: sessionId, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const mp = await mob.newPage();
await mp.goto(`${BASE}/dashboard`);
await mp.waitForLoadState('networkidle').catch(() => {}); await mp.waitForTimeout(1500);
await mp.screenshot({ path: `${OUT}/08-mobile-dashboard.png` });

await browser.close();
console.log('docs screenshots regenerated');
