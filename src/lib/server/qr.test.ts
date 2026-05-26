import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQRCode,
  deleteQRCode,
  generateQRImage,
  generateQRSVG,
  generateShortCode,
  getQRCode,
  listQRCodes,
  updateQRCode,
  verifyQRPassword
} from './qr';
import { db } from '$lib/db';

function createUser(email: string): number {
  const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return Number(result.lastInsertRowid);
}

describe('qr module', () => {
  beforeEach(() => {
    // Order matters: children before parents.
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM abuse_reports').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM campaigns').run();
    db.prepare('DELETE FROM otp_codes').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM users').run();
  });

  it('should create a QR code', () => {
    const result = createQRCode('https://example.com', null);
    expect(result.shortCode).toBeDefined();
    expect(result.shortCode.length).toBe(8);
  });

  it('should retrieve a QR code', () => {
    const { shortCode } = createQRCode('https://example.com', null);
    const qr = getQRCode(shortCode);
    expect(qr).toBeDefined();
    expect(qr.target_url).toBe('https://example.com');
  });

  it('should list QR codes for a user', () => {
    const user1 = createUser('user1@example.com');
    const user2 = createUser('user2@example.com');

    createQRCode('https://example.com/1', user1);
    createQRCode('https://example.com/2', user1);
    createQRCode('https://example.com/3', user2);

    const user1Qrs = listQRCodes(user1);
    expect(user1Qrs.length).toBe(2);
  });
  
  it('should update a QR code', () => {
    const { shortCode } = createQRCode('https://example.com', null);
    updateQRCode(shortCode, { target_url: 'https://updated.com' });
    const qr = getQRCode(shortCode);
    expect(qr.target_url).toBe('https://updated.com');
  });

  it('should reject updates to blacklisted target URLs', () => {
    const { shortCode } = createQRCode('https://example.com', null);

    expect(() => updateQRCode(shortCode, { target_url: 'https://bit.ly/abc123' })).toThrow();
  });

  it('should hash and verify QR passwords', () => {
    const { shortCode } = createQRCode('https://example.com', null, {}, undefined, undefined, 'secret');
    const qr = getQRCode(shortCode);

    expect(qr.password_hash).not.toBe('secret');
    expect(verifyQRPassword(qr.password_hash, 'secret')).toBe(true);
    expect(verifyQRPassword(qr.password_hash, 'wrong')).toBe(false);
  });
  
  it('should delete a QR code', () => {
    const { shortCode } = createQRCode('https://example.com', null);
    deleteQRCode(shortCode);
    const qr = getQRCode(shortCode);
    expect(qr).toBeUndefined();
  });
  
  it('should reject blacklisted URLs', () => {
    expect(() => createQRCode('https://bit.ly/abc123', null)).toThrow();
  });
  
  it('should generate unique short codes', () => {
    const code1 = generateShortCode();
    const code2 = generateShortCode();
    expect(code1).not.toBe(code2);
    expect(code1.length).toBe(8);
  });

  it('should generate SVG QR output', async () => {
    const svg = await generateQRSVG('https://example.com');

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('should generate PNG QR output', async () => {
    const png = await generateQRImage('https://example.com');

    expect(png).toMatch(/^data:image\/png;base64,/);
  });
});
