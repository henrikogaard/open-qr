import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, generateOTP, getUserBySession, hashSecret, sendLoginCode, verifyOTP } from './auth';
import { db } from '$lib/db';

function createUser(email: string): number {
  const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return Number(result.lastInsertRowid);
}

describe('auth module', () => {
  beforeEach(() => {
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
    const row = db.prepare(`
      SELECT code FROM otp_codes
      JOIN users ON users.id = otp_codes.user_id
      WHERE users.email = ?
    `).get('test@example.com') as { code: string };

    expect(row.code).not.toMatch(/^\d{6}$/);
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
