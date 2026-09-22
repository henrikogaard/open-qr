import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { runCleanup } from './cleanup';
import { hashSecret } from './auth';
import { setSetting } from './settings';

function insertUser(email: string, extra: { is_admin?: number; ageDays?: number } = {}): number {
  const createdAt = extra.ageDays ? new Date(Date.now() - extra.ageDays * 86_400_000).toISOString() : new Date().toISOString();
  const result = db
    .prepare('INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)')
    .run(email, extra.is_admin ?? 0, createdAt);
  return Number(result.lastInsertRowid);
}

function insertSession(userId: number, expired = false): void {
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    `s-${userId}-${expired}`,
    userId,
    new Date(Date.now() + (expired ? -60_000 : 60 * 60 * 1000)).toISOString()
  );
}

function insertOtp(email: string | null, userId: number | null, opts: { used?: boolean; expired?: boolean } = {}): void {
  const expires = new Date(Date.now() + (opts.expired ? -60_000 : 600_000)).toISOString();
  db.prepare('INSERT INTO otp_codes (user_id, email, code, expires_at, used) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    email,
    hashSecret('123456'),
    expires,
    opts.used ? 1 : 0
  );
}

beforeEach(() => {
  db.prepare('DELETE FROM scan_logs').run();
  db.prepare('DELETE FROM abuse_reports').run();
  db.prepare('DELETE FROM qr_codes').run();
  db.prepare('DELETE FROM campaigns').run();
  db.prepare('DELETE FROM api_keys').run();
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM otp_codes').run();
  db.prepare('DELETE FROM style_presets').run();
  db.prepare('DELETE FROM users').run();
});

describe('runCleanup', () => {
  it('deletes expired sessions but keeps live ones', () => {
    const userId = insertUser('keeper@example.com');
    insertSession(userId, true);
    insertSession(userId, false);

    const result = runCleanup();

    expect(result.expiredSessions).toBe(1);
    const remaining = db.prepare('SELECT id FROM sessions').all() as { id: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(`s-${userId}-false`);
  });

  it('deletes used and expired OTP codes but keeps pending ones', () => {
    insertOtp('a@example.com', null, { used: true });
    insertOtp('b@example.com', null, { expired: true });
    insertOtp('c@example.com', null);

    const result = runCleanup();

    expect(result.spentOtpCodes).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS n FROM otp_codes').get() as { n: number }).n).toBe(1);
  });

  it('purges stale users with no activity past the cutoff', () => {
    const stale = insertUser('stale@example.com', { ageDays: 40 });
    const recent = insertUser('recent@example.com');
    void recent;

    const result = runCleanup();

    expect(result.staleUsers).toBe(1);
    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(stale)).toBeUndefined();
    expect(
      db.prepare('SELECT id FROM users WHERE email = ?').get('recent@example.com')
    ).toBeDefined();
  });

  it('keeps stale-dated users that own QR codes, keys, sessions, or pending OTPs', () => {
    const withQr = insertUser('qr-owner@example.com', { ageDays: 40 });
    const qrResult = db
      .prepare('INSERT INTO qr_codes (short_code, target_url, user_id) VALUES (?, ?, ?)')
      .run('withqr1', 'https://example.com', withQr);

    const withKey = insertUser('key-owner@example.com', { ageDays: 40 });
    db.prepare('INSERT INTO api_keys (user_id, key_hash) VALUES (?, ?)').run(withKey, 'deadbeef');

    const withSession = insertUser('session-owner@example.com', { ageDays: 40 });
    insertSession(withSession);

    const withOtp = insertUser('otp-owner@example.com', { ageDays: 40 });
    insertOtp('otp-owner@example.com', withOtp);

    const result = runCleanup();

    expect(result.staleUsers).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).toMatchObject({ n: 4 });
    expect(qrResult.changes).toBe(1);
  });

  it('never purges admins', () => {
    const admin = insertUser('admin@example.com', { is_admin: 1, ageDays: 400 });

    runCleanup();

    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(admin)).toBeDefined();
  });

  it('respects PURGE_STALE_USERS_DAYS = 0 as disabled', () => {
    setSetting('PURGE_STALE_USERS_DAYS', '0');

    insertUser('stale@example.com', { ageDays: 400 });
    const result = runCleanup();

    expect(result.staleUsers).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).toMatchObject({ n: 1 });

    setSetting('PURGE_STALE_USERS_DAYS', '30');
  });

  it('cleans a stale user whose session expired and OTP was spent, all in one sweep', () => {
    const stale = insertUser('stale@example.com', { ageDays: 40 });
    insertSession(stale, true); // expired
    insertOtp('stale@example.com', stale, { used: true });

    const result = runCleanup();

    expect(result.staleUsers).toBe(1);
    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(stale)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM otp_codes').get() as { n: number }).toMatchObject({ n: 0 });
  });
});
