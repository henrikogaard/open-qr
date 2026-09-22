import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  generateOTP,
  getUserBySession,
  hashSecret,
  resetOtpRateLimits,
  sendLoginCode,
  verifyOTP
} from './auth';
import { db } from '$lib/db';

function createUser(email: string): number {
  const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return Number(result.lastInsertRowid);
}

describe('auth module', () => {
  beforeEach(() => {
    process.env.OPENQR_AUTO_PROMOTE_FIRST_USER = 'false';
    resetOtpRateLimits();
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM abuse_reports').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM campaigns').run();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM otp_codes').run();
    db.prepare('DELETE FROM users').run();
  });

  it('should generate 6-digit OTP', () => {
    const otp = generateOTP();
    expect(otp.length).toBe(6);
    expect(Number(otp)).toBeGreaterThanOrEqual(100000);
    expect(Number(otp)).toBeLessThanOrEqual(999999);
  });

  it('should create and validate session', () => {
    const userId = createUser('test@example.com');
    const sessionId = createSession(userId);
    expect(sessionId).toBeDefined();

    const user = getUserBySession(sessionId);
    expect(user).toBeDefined();
    expect(user?.id).toBe(userId);
  });

  it('should invalidate expired sessions', () => {
    const userId = createUser('test@example.com');
    const sessionId = createSession(userId);
    // Manually expire the session
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(sessionId);

    const user = getUserBySession(sessionId);
    expect(user).toBeNull();
  });

  it('should invalidate expired ISO sessions on the same day', () => {
    const userId = createUser('test@example.com');
    const sessionId = createSession(userId);
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), sessionId);

    const user = getUserBySession(sessionId);
    expect(user).toBeNull();
  });

  it('should verify valid OTP', async () => {
    const userId = createUser('test@example.com');
    db.prepare('INSERT INTO otp_codes (user_id, code, expires_at) VALUES (?, ?, ?)')
      .run(userId, hashSecret('123456'), new Date(Date.now() + 60_000).toISOString());

    const result = verifyOTP('test@example.com', '123456');
    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it('should store OTPs hashed, not plaintext', async () => {
    await sendLoginCode('test@example.com');
    const row = db.prepare('SELECT code FROM otp_codes WHERE email = ?').get('test@example.com') as {
      code: string;
    };

    expect(row.code).not.toMatch(/^\d{6}$/);
  });

  it('should not create the account until the OTP is verified', async () => {
    await sendLoginCode('newuser@example.com');

    const before = db.prepare('SELECT id FROM users WHERE email = ?').get('newuser@example.com');
    expect(before).toBeUndefined();

    // Verify with a code we control (sendLoginCode's own code is unknown).
    db.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
      .run('newuser@example.com', hashSecret('123456'), new Date(Date.now() + 60_000).toISOString());
    const result = verifyOTP('newuser@example.com', '123456');

    expect(result.success).toBe(true);
    const after = db.prepare('SELECT id FROM users WHERE email = ?').get('newuser@example.com');
    expect(after).toBeDefined();
  });

  it('should not reuse a consumed OTP', () => {
    db.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
      .run('test@example.com', hashSecret('123456'), new Date(Date.now() + 60_000).toISOString());

    expect(verifyOTP('test@example.com', '123456').success).toBe(true);
    expect(verifyOTP('test@example.com', '123456').success).toBe(false);
  });

  it('should auto-promote the first user to admin by default', () => {
    delete process.env.OPENQR_AUTO_PROMOTE_FIRST_USER;
    db.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
      .run('first@example.com', hashSecret('123456'), new Date(Date.now() + 60_000).toISOString());
    verifyOTP('first@example.com', '123456');

    const row = db.prepare('SELECT is_admin FROM users WHERE email = ?').get('first@example.com') as {
      is_admin: number;
    };

    expect(row.is_admin).toBe(1);
  });

  it('should not auto-promote the first user to admin when explicitly disabled', () => {
    db.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
      .run('first@example.com', hashSecret('123456'), new Date(Date.now() + 60_000).toISOString());
    verifyOTP('first@example.com', '123456');

    const row = db.prepare('SELECT is_admin FROM users WHERE email = ?').get('first@example.com') as {
      is_admin: number;
    };

    expect(row.is_admin).toBe(0);
  });

  it('should throttle OTP sends by IP address to reduce automated abuse', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(sendLoginCode(`user${i}@example.com`, { ip: '203.0.113.10' })).resolves.toBeUndefined();
    }

    await expect(sendLoginCode('user3@example.com', { ip: '203.0.113.10' })).rejects.toThrow(
      'Too many login code requests. Please try again later.'
    );
  });

  it('should not consume the email OTP quota when the IP quota is already exhausted', async () => {
    for (let i = 0; i < 3; i += 1) {
      await sendLoginCode(`filler${i}@example.com`, { ip: '203.0.113.10' });
    }

    await expect(sendLoginCode('victim@example.com', { ip: '203.0.113.10' })).rejects.toThrow(
      'Too many login code requests. Please try again later.'
    );

    for (let i = 0; i < 5; i += 1) {
      await expect(sendLoginCode('victim@example.com', { ip: `203.0.113.${20 + i}` })).resolves.toBeUndefined();
    }
  });

  it('should reject expired ISO OTPs on the same day', async () => {
    const userId = createUser('test@example.com');
    db.prepare('INSERT INTO otp_codes (user_id, code, expires_at) VALUES (?, ?, ?)')
      .run(userId, hashSecret('123456'), new Date(Date.now() - 60_000).toISOString());

    const result = verifyOTP('test@example.com', '123456');
    expect(result.success).toBe(false);
  });

  it('should reject invalid OTP', () => {
    const result = verifyOTP('test@example.com', '000000');
    expect(result.success).toBe(false);
  });
});
