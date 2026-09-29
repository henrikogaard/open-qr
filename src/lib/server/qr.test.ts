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
    const png = await generateQRImage('https://example.com', { borderSize: 'medium' });

    expect(png).toMatch(/^data:image\/png;base64,/);

    // Decode enough of the PNG to prove it rasterized at the intrinsic SVG
    // size (400px code + 20px border on each side) with real image content.
    const raw = Buffer.from(png.split(',')[1]!, 'base64');
    expect(raw.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(raw.readUInt32BE(16)).toBe(440); // IHDR width
    expect(raw.readUInt32BE(20)).toBe(440); // IHDR height
    expect(raw.length).toBeGreaterThan(5_000);
  });

  it('should render styled PNGs (template, border style, center text) without error', async () => {
    const png = await generateQRImage('https://example.com/styled', {
      template: 'colorful',
      borderStyle: 'dashed',
      centerType: 'text',
      centerText: 'DEMO',
      centerTextColor: '#d65d0e'
    });
    expect(png).toMatch(/^data:image\/png;base64,/);
    expect(png.length).toBeGreaterThan(5_000);
  });

  it('should create static-kind codes without URL safety checks', () => {
    // A WIFI: payload is not a URL — the URL allow-list must not apply.
    const { shortCode } = createQRCode('WIFI:T:WPA;S:Net;P:pw;;', null, {}, undefined, undefined, undefined, undefined, undefined, 'wifi');
    const qr = getQRCode(shortCode);
    expect(qr.kind).toBe('wifi');
    expect(qr.target_url).toBe('WIFI:T:WPA;S:Net;P:pw;;');
  });

  it('should still enforce URL safety for url-kind codes', () => {
    expect(() => createQRCode('WIFI:T:WPA;S:Net;P:pw;;', null, {}, undefined, undefined, undefined, undefined, undefined, 'url')).toThrow();
  });

  it('should render static payloads with raw mode', async () => {
    const payload = 'WIFI:T:WPA;S:Net;P:pw;;';
    const svg = await generateQRSVG(payload, {}, { raw: true });
    expect(svg).toContain('<svg');
    // Without raw, the scheme allow-list rejects the non-URL payload.
    await expect(generateQRSVG(payload)).rejects.toThrow();
  });

  it('should allow static payload edits but re-validate URL edits', () => {
    const { shortCode } = createQRCode('hello', null, {}, undefined, undefined, undefined, undefined, undefined, 'text');
    updateQRCode(shortCode, { target_url: 'hello again' });
    expect(getQRCode(shortCode).target_url).toBe('hello again');

    // Switching the row back to url kind re-arms the URL checks.
    expect(() => updateQRCode(shortCode, { kind: 'url' })).not.toThrow();
    expect(() => updateQRCode(shortCode, { target_url: 'javascript:alert(1)' })).toThrow();
  });

  it('should rasterize PNGs at requested sizes', async () => {
    const png = await generateQRImage('https://example.com', {}, { pngSize: 1200 });
    const raw = Buffer.from(png.split(',')[1]!, 'base64');
    expect(raw.readUInt32BE(16)).toBe(1200); // IHDR width
    expect(raw.readUInt32BE(20)).toBe(1200); // IHDR height
  });
});
