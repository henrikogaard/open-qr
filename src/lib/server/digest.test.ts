import { describe, it, expect, beforeEach } from 'vitest';
import { digestEligibleUsers, digestStatsFor, maybeSendWeeklyDigests } from './digest';
import { createQRCode } from './qr';
import { setSetting } from './settings';
import { db } from '$lib/db';

function createUser(email: string, optIn = 1): number {
  return Number(
    db.prepare('INSERT INTO users (email, digest_opt_in) VALUES (?, ?)').run(email, optIn).lastInsertRowid
  );
}

function logScan(qrCodeId: number, ipHash: string, deviceClass: string | null = 'mobile', ageMinutes = 60): void {
  db.prepare(
    `INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, device_class, timestamp)
     VALUES (?, ?, 'ua', ?, datetime('now', ?))`
  ).run(qrCodeId, ipHash, deviceClass, `-${ageMinutes} minutes`);
}

describe('weekly digest', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM qr_variants').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM campaigns').run();
    db.prepare('DELETE FROM users').run();
    setSetting('ENABLE_WEEKLY_DIGEST', 'false');
  });

  it('is a no-op when the operator has not enabled digests', async () => {
    setSetting('ENABLE_WEEKLY_DIGEST', 'false');
    createUser('off@example.com');
    const result = await maybeSendWeeklyDigests();
    expect(result).toEqual({ sent: 0, skipped: 0 });
  });

  it('lists opted-in users outside the cadence window', () => {
    const fresh = createUser('fresh@example.com');
    const recent = createUser('recent@example.com');
    const old = createUser('old@example.com');
    const optedOut = createUser('out@example.com', 0);

    db.prepare("UPDATE users SET last_digest_at = datetime('now', '-1 day') WHERE id = ?").run(recent);
    db.prepare("UPDATE users SET last_digest_at = datetime('now', '-8 days') WHERE id = ?").run(old);

    const now = Date.now();
    const eligible = digestEligibleUsers(now, 7 * 24 * 3600 * 1000 - 2 * 3600 * 1000).map((u) => u.id);
    expect(eligible).toContain(fresh);
    expect(eligible).toContain(old);
    expect(eligible).not.toContain(recent);
    expect(eligible).not.toContain(optedOut);
  });

  it('aggregates human scans and top codes per user', () => {
    const userId = createUser('stats@example.com');
    const a = createQRCode('https://a.example.com', userId);
    const b = createQRCode('https://b.example.com', userId);
    const idA = (db.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(a.shortCode) as { id: number }).id;
    const idB = (db.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(b.shortCode) as { id: number }).id;

    logScan(idA, 'h1');
    logScan(idA, 'h2');
    logScan(idA, 'h1'); // same device — total counts it, uniques don't
    logScan(idB, 'h3');
    logScan(idB, 'h4', 'bot'); // bots never counted
    logScan(idA, 'h9', 'mobile', 8 * 24 * 60); // outside the 7-day window

    const stats = digestStatsFor(userId, new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' '));
    expect(stats.totalScans).toBe(4);
    expect(stats.topCodes[0]).toMatchObject({ shortCode: a.shortCode, count: 3 });
    expect(stats.topCodes.length).toBe(2);
  });

  it('sends to eligible users with scans and stamps last_digest_at', async () => {
    setSetting('ENABLE_WEEKLY_DIGEST', 'true');
    const userId = createUser('send@example.com');
    const { shortCode } = createQRCode('https://x.example.com', userId);
    const qrId = (db.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number }).id;
    logScan(qrId, 'h1');

    // Console mail provider in tests: sendDigest resolves without network.
    const result = await maybeSendWeeklyDigests();
    expect(result.sent).toBe(1);

    const row = db.prepare('SELECT last_digest_at FROM users WHERE id = ?').get(userId) as {
      last_digest_at: string;
    };
    expect(row.last_digest_at).toBeTruthy();

    // Second run the same instant: inside the cadence window, nothing sent.
    const again = await maybeSendWeeklyDigests();
    expect(again.sent).toBe(0);
  });

  it('skips zero-scan users without stamping them', async () => {
    setSetting('ENABLE_WEEKLY_DIGEST', 'true');
    createUser('quiet@example.com');
    const result = await maybeSendWeeklyDigests();
    expect(result).toEqual({ sent: 0, skipped: 1 });
  });
});
