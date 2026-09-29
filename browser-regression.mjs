// Browser regression walkthrough for Open-QR 1.5.0 against the dev server
// (127.0.0.1:5173, isolated DB). Drives real Chromium, screenshots every
// step into gui-test-screenshots/, and collects console/page errors.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5173';
const SHOTS = 'gui-test-screenshots';
const SERVER_LOG = process.argv[2];
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
let step = 0;

function log(name, pass, detail = '') {
  step++;
  results.push({ step, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  t${String(step).padStart(2, '0')}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ at: page.url(), text: m.text().slice(0, 300) });
});
page.on('pageerror', (e) => consoleErrors.push({ at: page.url(), text: 'pageerror: ' + String(e).slice(0, 300) }));

async function shot(name) {
  step++;
  await page.screenshot({ path: `${SHOTS}/t${String(step).padStart(2, '0')}-${name}.png`, fullPage: false });
  console.log(`SHOT  t${String(step).padStart(2, '0')}-${name}.png`);
  step--; // shots don't consume test numbers
}

// ---------------------------------------------------------------- landing
await page.goto(BASE);
await page.waitForLoadState('domcontentloaded');
log('Landing: title shows app + version', (await page.title()).includes('Open-QR'));
log('Landing: content-type selector offers 8 kinds', (await page.locator('#content-type option').count()) === 8);
log('Landing: Generate disabled before terms', await page.getByRole('button', { name: 'Generate QR code' }).isDisabled());
await shot('landing-generator');

// ------------------------------------------------------- T1: URL QR flow
await page.getByRole('checkbox', { name: /I agree to the Terms of Use/ }).check();
await page.fill('#target-url', 'https://example.com/browser-test');
await page.locator('img[alt="QR Code"]').waitFor({ timeout: 10000 });
log('T1 URL: live preview renders while typing', true);
await shot('t1-live-preview');

await page.getByRole('button', { name: 'Generate QR code' }).click();
await page.getByText('Short URL').waitFor({ timeout: 10000 });
const shortUrlText = await page.locator('a[href*="/go/"]').first().textContent();
let urlCode = shortUrlText.trim().split('/go/')[1];
log('T1 URL: generated, short URL shown', Boolean(urlCode), shortUrlText);
log('T1 URL: PNG size options 400–2000', (await page.locator('#png-size option').count()) === 4);
await shot('t1-url-generated');

// ------------------------------------------------------------- T2: UTM
await page.getByRole('button', { name: /UTM tracking parameters/ }).click();
await page.fill('#utm-source', 'poster');
await page.fill('#utm-medium', 'qr');
await page.fill('#utm-campaign', 'browser-regression');
await page.waitForTimeout(300);
const finalUrlPreview = await page.getByText('https://example.com/browser-test?').textContent().catch(() => '');
log('T2 UTM: tagged destination previewed', finalUrlPreview.includes('utm_source=poster') && finalUrlPreview.includes('utm_medium=qr'), finalUrlPreview);
await shot('t2-utm-open');
await page.getByRole('button', { name: 'Generate QR code' }).click();
await page.waitForTimeout(800);
await shot('t2-utm-generated');
const utmShortUrl = await page.locator('aside a[href*="/go/"]').first().textContent();
urlCode = utmShortUrl.trim().split('/go/')[1];

// ------------------------------------------------------ T3: Wi-Fi static
await page.selectOption('#content-type', 'wifi');
await page.waitForSelector('#wifi-ssid');
log('T3 WiFi: static notice shown', await page.getByText('Static codes encode their content directly', { exact: false }).isVisible());
await page.fill('#wifi-ssid', 'Browser-Test-Cafe');
await page.fill('#wifi-password', 'latte-2026');
await page.locator('img[alt="QR Code"]').waitFor({ timeout: 10000 });
await page.getByRole('button', { name: 'Generate QR code' }).click();
await page.getByText('Static QR', { exact: false }).first().waitFor({ timeout: 10000 });
log('T3 WiFi: static code generated, untracked note shown', true);
const hasShortUrlBlock = await page.locator('aside').getByText('Short URL').count();
log('T3 WiFi: no short URL for static codes', hasShortUrlBlock === 0);
await shot('t3-wifi-static');

// ------------------------------------------------------- T4: vCard spot
await page.selectOption('#content-type', 'vcard');
await page.waitForSelector('#vcard-first');
await page.fill('#vcard-first', 'Ada');
await page.fill('#vcard-last', 'Lovelace');
await page.fill('#vcard-phone', '+47 900 00 000');
await page.locator('img[alt="QR Code"]').waitFor({ timeout: 10000 });
log('T4 vCard: preview renders from contact fields', true);
await shot('t4-vcard');

// -------------------------------------------- T5: boundary — empty SSID
await page.selectOption('#content-type', 'wifi');
await page.waitForSelector('#wifi-ssid');
await page.fill('#wifi-ssid', ' ');
await page.locator('#wifi-ssid').fill('');
await page.getByRole('button', { name: 'Generate QR code' }).click();
await page.waitForTimeout(600);
const wifiErr = await page.locator('.alert-danger').textContent().catch(() => '');
log('T5 boundary: empty Wi-Fi SSID rejected with message', /SSID/i.test(wifiErr), wifiErr.trim());
await shot('t5-wifi-empty-ssid');

// ---------------------------------------------------------- T6: login
await page.goto(BASE + '/login');
await page.fill('#email', 'browser-tester@example.com');
await page.click('button[type="submit"]');
await page.waitForURL(/verify-otp\?email=/, { timeout: 45000 });
log('T6 login: PoW solved in browser, reached verify page', true);
await shot('t6-verify-otp');

const otp = (() => {
  const logText = readFileSync(SERVER_LOG, 'utf8');
  const lastEmail = logText.lastIndexOf('browser-tester@example.com');
  if (lastEmail === -1) return null;
  const m = /verification code is: (\d{6})/.exec(logText.slice(lastEmail));
  return m ? m[1] : null;
})();
log('T6 login: OTP present in dev server log', Boolean(otp));
const codeInput = page.locator('input').first();
await codeInput.fill(otp);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 15000 });
log('T6 login: OTP verify lands on dashboard', true);
await shot('t6-dashboard-after-login');

// Adopt the anonymous codes created earlier in this same browser session
const adoptBtn = page.getByRole('button', { name: /Add to my account/ });
if (await adoptBtn.count()) {
  await adoptBtn.click();
  await page.waitForTimeout(1500);
  log('T6 login: anonymous codes adopted into account', true);
} else {
  log('T6 login: anonymous codes adopted into account', false, 'adopt banner not shown');
}

// ------------------------------------------------------- T7: dashboard
await page.waitForSelector('text=My QR codes');
log('T7 dashboard: cards render', (await page.locator('article.card').count()) >= 2);
log('T7 dashboard: static badge on Wi-Fi card', (await page.getByText('Static · wifi', { exact: false }).count()) === 1);
log('T7 dashboard: campaigns section', (await page.getByText('Campaigns', { exact: false }).count()) >= 1);
log('T7 dashboard: webhooks & digest section', await page.getByText('Webhooks & digests', { exact: false }).isVisible());
await shot('t7-dashboard');

// digest toggle
await page.getByText('Subscribe', { exact: false }).click();
await page.waitForTimeout(500);
log('T7 dashboard: digest opt-in toggles', (await page.getByText('Subscribed', { exact: false }).count()) === 1);
await shot('t7-digest-subscribed');

// ---------------------------------------------------------- T8: webhook
await page.fill('#webhook-url', 'http://203.0.113.10/hooks/open-qr');
await page.getByRole('button', { name: 'Add webhook' }).click();
await page.getByText('Copy this signing secret now', { exact: false }).waitFor({ timeout: 10000 });
log('T8 webhook: created, secret revealed once', true);
await shot('t8-webhook-secret');
await page.getByRole('button', { name: 'Dismiss' }).click();
await page.waitForTimeout(300);
log('T8 webhook: endpoint listed', (await page.getByText('203.0.113.10', { exact: false }).count()) >= 1);

// webhook boundary: private URL rejected
await page.fill('#webhook-url', 'http://127.0.0.1:9999/secret');
await page.getByRole('button', { name: 'Add webhook' }).click();
await page.waitForTimeout(600);
const hookErr = await page.locator('.alert-danger').textContent().catch(() => '');
log('T8 webhook: private address rejected', /private|local|URL/i.test(hookErr), hookErr.trim().slice(0, 80));
await shot('t8-webhook-ssrf-blocked');

// ----------------------------------------------- T9: scans via /go/ hits
for (let i = 0; i < 5; i++) {
  await page.request.get(`${BASE}/go/${urlCode}?continue=1`, { maxRedirects: 0 });
}
const redirectResp = await page.request.get(`${BASE}/go/${urlCode}?continue=1`, { maxRedirects: 0 });
log('T9 redirect: /go/ returns 302 to target', redirectResp.status() === 302 && redirectResp.headers()['location'] === 'https://example.com/browser-test?utm_source=poster&utm_medium=qr&utm_campaign=browser-regression', redirectResp.headers()['location']);

// ------------------------------------------------ T10: edit page + variants
await page.goto(`${BASE}/dashboard/qr/${urlCode}`);
await page.waitForSelector('text=Update settings');
await page.getByRole('button', { name: /Alternative targets/ }).click();
await page.getByRole('button', { name: 'Add variant' }).click();
await page.waitForSelector('#variant-url-0');
await page.fill('#variant-url-0', 'https://example.com/variant-b');
await page.fill('#variant-weight-0', '30');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.getByText('Saved', { exact: true }).waitFor({ timeout: 10000 });
log('T10 edit: variant saved', true);
await shot('t10-variant-saved');

// variant redirect check: with weight 30, some requests should hit variant
let variantHits = 0;
for (let i = 0; i < 30; i++) {
  const r = await page.request.get(`${BASE}/go/${urlCode}?continue=1`, { maxRedirects: 0 });
  if (r.headers()['location'] === 'https://example.com/variant-b') variantHits++;
}
log('T10 edit: A/B split serves variant ~30% (residual to main)', variantHits > 0 && variantHits < 30, `${variantHits}/30 hits`);

// ------------------------------------------------------- T11: stats page
await page.goto(`${BASE}/dashboard/qr/${urlCode}/stats`);
await page.waitForSelector('text=QR analytics');
log('T11 stats: unique devices metric shown', await page.getByText('Unique devices', { exact: false }).isVisible());
log('T11 stats: variant breakdown shown', await page.getByText('Target variants', { exact: false }).isVisible());
await page.selectOption('#granularity', 'hour');
await page.waitForTimeout(800);
log('T11 stats: hourly granularity selectable', true);
await shot('t11-stats-hourly');
await page.selectOption('#range-preset', '7d');
await page.waitForTimeout(800);
await shot('t11-stats-7d');

// -------------------------------------------- T12: password gate (POST)
await page.goto(BASE);
await page.getByRole('checkbox', { name: /I agree to the Terms of Use/ }).check();
await page.selectOption('#content-type', 'url');
await page.fill('#target-url', 'https://example.com/protected-dest');
await page.fill('#qr-password', 'hunter2');
await page.getByRole('button', { name: 'Generate QR code' }).click();
await page.getByText('Short URL').waitFor({ timeout: 10000 });
const pwShortUrl = await page.locator('a[href*="/go/"]').first().textContent();
const pwCode = pwShortUrl.trim().split('/go/')[1];

await page.goto(`${BASE}/go/${pwCode}`);
await page.waitForSelector('text=Protected link');
log('T12 password: gate form renders', true);
await page.fill('#qr-password', 'wrong-password');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByText('Incorrect password.').waitFor({ timeout: 10000 });
log('T12 password: wrong password rejected inline', true);
await shot('t12-wrong-password');

await page.fill('#qr-password', 'hunter2');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForURL('https://example.com/protected-dest', { timeout: 15000 });
log('T12 password: correct password redirects to target', true);
log('T12 password: secret never in URL', !page.url().includes('password') && !page.url().includes('hunter2'), page.url());
await shot('t12-redirected');

// ------------------------------------------------- T13: static /go/ page
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector('article.card');
const staticCardLink = page.locator('article.card', { hasText: 'Static · wifi' }).locator('a[aria-label="Edit"]').first();
await staticCardLink.click();
await page.waitForSelector('text=Update settings');
const staticEditUrl = page.url();
const staticCode = staticEditUrl.split('/dashboard/qr/')[1];
await page.goto(`${BASE}/go/${staticCode}`);
await page.waitForSelector('text=Static QR code');
const payloadShown = await page.locator('pre').textContent();
log('T13 static: /go/ shows payload, no redirect', payloadShown.includes('Browser-Test-Cafe') && payloadShown.includes('WIFI:'), payloadShown.trim().slice(0, 60));
await shot('t13-static-go-page');

// static edit form prefill (decode round-trip)
await page.goto(staticEditUrl);
await page.waitForSelector('#edit-wifi-ssid');
const prefilledSsid = await page.inputValue('#edit-wifi-ssid');
const prefilledPass = await page.inputValue('#edit-wifi-password');
log('T13 static: edit form prefilled from payload', prefilledSsid === 'Browser-Test-Cafe' && prefilledPass === 'latte-2026', `${prefilledSsid} / ${prefilledPass}`);
await shot('t13-static-edit-prefill');

// ------------------------------------------------------- T14: admin
await page.goto(BASE + '/admin');
await page.waitForSelector('text=Admin');
await page.getByRole('button', { name: 'Settings', exact: true }).click().catch(async () => {
  await page.getByText('Settings', { exact: true }).click();
});
await page.waitForTimeout(500);
log('T14 admin: weekly digest toggle present', (await page.getByText('Allow weekly scan digests', { exact: false }).count()) === 1);
log('T14 admin: generator default selects present', (await page.locator('#default-template, #default-error-correction').count()) === 2);
await shot('t14-admin-settings');

// ------------------------------------------------- T15: mobile viewport
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(600);
log('T15 mobile: landing renders at 390px', (await page.locator('#content-type').count()) === 1);
await shot('t15-mobile-landing');
await page.goto(BASE + '/dashboard');
await page.waitForTimeout(800);
await shot('t15-mobile-dashboard');

await browser.close();

// ---------------------------------------------------------------- report
const failed = results.filter((r) => !r.pass);
console.log('\n================ BROWSER REGRESSION SUMMARY ================');
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILURES:');
  for (const f of failed) console.log(`  t${String(f.step).padStart(2, '0')} ${f.name} — ${f.detail}`);
}
console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  [${e.at}] ${e.text}`);
