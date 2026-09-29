import { describe, it, expect, beforeEach } from 'vitest';
import { dashboardOverview } from './dashboard-stats';
import { createQRCode, updateQRCode } from './qr';
import { replaceVariants } from './variants';
import { db } from '$lib/db';

describe('dashboard-stats', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM qr_variants').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM users').run();
  });

  let userSeq = 0;
  const seedUser = (): number =>
    Number(
      db.prepare('INSERT INTO users (email) VALUES (?)').run(`stats-${++userSeq}@example.com`).lastInsertRowid
    );

  function seedCode(userId: number, targetUrl = 'https://main.example.com'): string {
    return createQRCode(targetUrl, userId).shortCode;
  }

  function codeId(shortCode: string): number {
    return Number((db.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number }).id);
  }

  function logScan(
    qrCodeId: number,
    opts: { deviceClass?: string | null; country?: string | null; ageMinutes?: number; ipHash?: string } = {}
  ): void {
    const { deviceClass = 'mobile', country = null, ageMinutes = 5, ipHash = `ip-${Math.random()}` } = opts;
    db.prepare(
      `INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, device_class, country, timestamp)
       VALUES (?, ?, 'ua', ?, ?, datetime('now', ?))`
    ).run(qrCodeId, ipHash, deviceClass, country, `-${ageMinutes} minutes`);
  }

  it('returns zeros for a user with nothing', () => {
    const userId = seedUser();
    expect(dashboardOverview(userId)).toMatchObject({
      totalCodes: 0, activeCodes: 0, protectedCodes: 0,
      scans7d: 0, scans30d: 0, totalScans: 0, recentScans: []
    });
  });

  it('counts codes, active state, scans per window; excludes bots, static kinds and other users', () => {
    const userId = seedUser();
    const otherId = seedUser();
    const a = seedCode(userId);
    const b = seedCode(userId, 'https://b.example.com');
    const otherCode = seedCode(otherId, 'https://other.example.com');
    const staticCode = createQRCode('WIFI:T:WPA;S:x;P:y;;', userId, {}, undefined, undefined, undefined, undefined, undefined, 'wifi').shortCode;

    updateQRCode(b, { is_active: 0 });
    logScan(codeId(a), { ageMinutes: 10 });
    logScan(codeId(a), { ageMinutes: 10 * 24 * 60 });
    logScan(codeId(a), { deviceClass: 'bot' });
    logScan(codeId(staticCode));
    logScan(codeId(otherCode));

    const overview = dashboardOverview(userId);
    expect(overview.totalCodes).toBe(3);
    expect(overview.activeCodes).toBe(2);
    expect(overview.scans7d).toBe(1);
    expect(overview.scans30d).toBe(2);
    expect(overview.totalScans).toBe(2);
  });

  it('counts protected codes: password, expiry or variants', () => {
    const userId = seedUser();
    const a = seedCode(userId);
    const b = seedCode(userId, 'https://b.example.com');
    const c = seedCode(userId, 'https://c.example.com');
    seedCode(userId, 'https://d.example.com');

    updateQRCode(a, { password_hash: 'secret' });
    updateQRCode(b, { expires_at: '2030-01-01 00:00:00' });
    replaceVariants(codeId(c), [{ targetUrl: 'https://alt.example.com', weight: 30 }]);

    expect(dashboardOverview(userId).protectedCodes).toBe(3);
  });

  it('lists recent human scans newest-first with preformatted times', () => {
    const userId = seedUser();
    const a = seedCode(userId);
    const b = seedCode(userId, 'https://b.example.com');
    logScan(codeId(a), { ageMinutes: 2, country: 'NO' });
    logScan(codeId(b), { ageMinutes: 90, country: 'SE', deviceClass: 'desktop' });
    logScan(codeId(a), { deviceClass: 'bot' });

    const recent = dashboardOverview(userId).recentScans;
    expect(recent.length).toBe(2);
    expect(recent[0].shortCode).toBe(a);
    expect(recent[0].timeAgo).toBe('2 min ago');
    expect(recent[1].shortCode).toBe(b);
    expect(recent[1].timeAgo).toBe('1 hour ago');
    expect(recent[1].country).toBe('SE');
  });

  it('caps the feed at 12 entries and falls back to ISO dates past a week', () => {
    const userId = seedUser();
    const a = seedCode(userId);
    for (let i = 0; i < 15; i++) logScan(codeId(a), { ageMinutes: (i + 1) * 24 * 60 });
    const recent = dashboardOverview(userId).recentScans;
    expect(recent.length).toBe(12);
    expect(recent[0].timeAgo).toBe('yesterday');
    expect(recent[11].timeAgo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
