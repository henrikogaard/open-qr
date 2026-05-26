import { db } from '$lib/db';
import { pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { sendOTP } from './mail';

const HASH_PREFIX = 'pbkdf2_sha256';
const HASH_ITERATIONS = 120_000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = 'sha256';
const otpSendAttempts = new Map<string, number[]>();
const otpVerifyAttempts = new Map<string, number[]>();

function isExpired(expiresAt: string): boolean {
  const timestamp = Date.parse(expiresAt);
  return Number.isNaN(timestamp) || timestamp <= Date.now();
}

function pruneWindow(values: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return values.filter((value) => value > cutoff);
}

function consumeRateLimit(bucket: Map<string, number[]>, key: string, limit: number, windowMs: number): boolean {
  const attempts = pruneWindow(bucket.get(key) || [], windowMs);
  if (attempts.length >= limit) {
    bucket.set(key, attempts);
    return false;
  }
  attempts.push(Date.now());
  bucket.set(key, attempts);
  return true;
}

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(secret, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export function verifySecret(storedHash: string | null | undefined, secret: string | null | undefined): boolean {
  if (!storedHash || !secret) return false;

  const [prefix, iterationsRaw, salt, hash] = storedHash.split('$');
  if (prefix !== HASH_PREFIX || !iterationsRaw || !salt || !hash) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = pbkdf2Sync(secret, salt, iterations, expected.length, HASH_DIGEST);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateOTP(): string {
  return randomInt(100000, 1000000).toString();
}

export function createSession(userId: number): string {
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, expiresAt.toISOString());
  
  return sessionId;
}

export function getUserBySession(sessionId: string): { id: number; email: string; isAdmin: boolean } | null {
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, u.email, u.is_admin 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.id = ?
  `).get(sessionId) as any;
  
  if (!session) return null;
  if (isExpired(session.expires_at)) {
    destroySession(sessionId);
    return null;
  }
  
  return {
    id: session.user_id,
    email: session.email,
    isAdmin: session.is_admin === 1
  };
}

export function destroySession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export async function sendLoginCode(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!consumeRateLimit(otpSendAttempts, normalizedEmail, 5, 10 * 60 * 1000)) {
    throw new Error('Too many login code requests. Please try again later.');
  }

  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: number } | undefined;
  
  if (!user) {
    const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(normalizedEmail);
    user = { id: Number(result.lastInsertRowid) };
    
    // First user becomes admin
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count === 1) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    }
  }
  
  const code = generateOTP();
  const codeHash = hashSecret(code);
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  
  db.prepare('INSERT INTO otp_codes (user_id, code, expires_at) VALUES (?, ?, ?)')
    .run(user.id, codeHash, expiresAt.toISOString());
  
  await sendOTP(normalizedEmail, code);
}

export function verifyOTP(email: string, code: string): { success: boolean; sessionId?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  if (!consumeRateLimit(otpVerifyAttempts, normalizedEmail, 10, 10 * 60 * 1000)) {
    return { success: false };
  }

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: number } | undefined;
  if (!user) return { success: false };
  
  const otps = db.prepare(`
    SELECT id, code, expires_at FROM otp_codes 
    WHERE user_id = ? AND used = 0
    ORDER BY created_at DESC
    LIMIT 10
  `).all(user.id) as { id: number; code: string; expires_at: string }[];
  const otp = otps.find((candidate) => !isExpired(candidate.expires_at) && verifySecret(candidate.code, code));
  
  if (!otp) return { success: false };
  
  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);
  
  const sessionId = createSession(user.id);
  return { success: true, sessionId };
}
