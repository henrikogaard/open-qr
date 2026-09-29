import { describe, it, expect, beforeEach } from 'vitest';
import { listVariants, replaceVariants, resolveTarget } from './variants';
import { createQRCode } from './qr';
import { db } from '$lib/db';

describe('variants', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM qr_variants').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM campaigns').run();
    db.prepare('DELETE FROM users').run();
  });

  function seed(): number {
    const { shortCode } = createQRCode('https://main.example.com', null);
    const qr = db.prepare('SELECT id FROM qr_codes WHERE short_code = ?').get(shortCode) as { id: number };
    return qr.id;
  }

  it('replaces the variant set wholesale', () => {
    const qrId = seed();
    replaceVariants(qrId, [{ targetUrl: 'https://a.example.com', weight: 50 }, { targetUrl: 'https://b.example.com', weight: 50 }]);
    expect(listVariants(qrId).length).toBe(2);

    replaceVariants(qrId, [{ targetUrl: 'https://c.example.com', weight: 100 }]);
    const after = listVariants(qrId);
    expect(after.length).toBe(1);
    expect(after[0].target_url).toBe('https://c.example.com');
  });

  it('validates shape: missing URL, bad weight, inverted window', () => {
    const qrId = seed();
    expect(() => replaceVariants(qrId, [{ weight: 50 }])).toThrow(/target URL/i);
    expect(() => replaceVariants(qrId, [{ targetUrl: 'https://a.example.com', weight: 101 }])).toThrow(/weight/i);
    expect(() =>
      replaceVariants(qrId, [
        { targetUrl: 'https://a.example.com', startsAt: '2030-01-02T00:00', endsAt: '2030-01-01T00:00' }
      ])
    ).toThrow(/before its end/i);
  });

  it('falls back to the main URL when no variant applies', () => {
    const qrId = seed();
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;
    const resolved = resolveTarget(qr, { now: new Date('2030-01-01T00:00:00Z').getTime(), random: () => 0.5 });
    expect(resolved.url).toBe('https://main.example.com');
    expect(resolved.variantId).toBeNull();
  });

  it('serves a scheduled override while its window is open, then falls back', () => {
    const qrId = seed();
    replaceVariants(qrId, [
      { targetUrl: 'https://live.example.com', startsAt: '2030-06-01T09:00', endsAt: '2030-06-01T17:00', label: 'live' }
    ]);
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;

    const before = resolveTarget(qr, { now: new Date('2030-05-31T00:00:00Z').getTime(), random: () => 0 });
    expect(before.url).toBe('https://main.example.com');

    const during = resolveTarget(qr, { now: new Date('2030-06-01T12:00:00Z').getTime(), random: () => 0 });
    expect(during.url).toBe('https://live.example.com');
    expect(during.variantLabel).toBe('live');

    const after = resolveTarget(qr, { now: new Date('2030-06-02T00:00:00Z').getTime(), random: () => 0 });
    expect(after.url).toBe('https://main.example.com');
  });

  it('prefers the latest-starting window when several are open', () => {
    const qrId = seed();
    replaceVariants(qrId, [
      { targetUrl: 'https://early.example.com', startsAt: '2030-01-01T00:00' },
      { targetUrl: 'https://late.example.com', startsAt: '2030-02-01T00:00' }
    ]);
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;
    const resolved = resolveTarget(qr, { now: new Date('2030-03-01T00:00:00Z').getTime(), random: () => 0 });
    expect(resolved.url).toBe('https://late.example.com');
  });

  it('splits traffic by weight among in-window weighted variants', () => {
    const qrId = seed();
    replaceVariants(qrId, [
      { targetUrl: 'https://a.example.com', weight: 75, label: 'a' },
      { targetUrl: 'https://b.example.com', weight: 25, label: 'b' }
    ]);
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;
    const now = Date.now();

    const picks = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) {
      const resolved = resolveTarget(qr, { now, random: () => i / 1000 });
      picks[resolved.variantLabel as 'a' | 'b']++;
    }
    // 75/25 by construction; allow rounding slack.
    expect(Math.abs(picks.a - 750)).toBeLessThan(5);
    expect(Math.abs(picks.b - 250)).toBeLessThan(5);
  });

  it('sends residual traffic to the main URL when weights total under 100', () => {
    const qrId = seed();
    replaceVariants(qrId, [{ targetUrl: 'https://a.example.com', weight: 30, label: 'a' }]);
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;
    const now = Date.now();

    // Deterministic LCG so the ~30% share is reproducible.
    let state = 42;
    const rng = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };

    let variant = 0;
    let main = 0;
    for (let i = 0; i < 1000; i++) {
      const resolved = resolveTarget(qr, { now, random: rng });
      if (resolved.variantId) variant++;
      else main++;
    }
    expect(variant).toBeGreaterThan(250);
    expect(variant).toBeLessThan(350);
    expect(variant + main).toBe(1000);
  });

  it('skips inactive variants', () => {
    const qrId = seed();
    replaceVariants(qrId, [
      { targetUrl: 'https://paused.example.com', weight: 100, isActive: false }
    ]);
    const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(qrId) as any;
    const resolved = resolveTarget(qr, { now: Date.now(), random: () => 0 });
    expect(resolved.url).toBe('https://main.example.com');
  });
});
