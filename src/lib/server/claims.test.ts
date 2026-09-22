import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { adoptClaimedQrCodes, countClaimableQrCodes, hashClaimToken, newClaimToken } from './claims';

beforeEach(() => {
  db.prepare('DELETE FROM scan_logs').run();
  db.prepare('DELETE FROM qr_codes').run();
  db.prepare('DELETE FROM users').run();
});

function insertQr(shortCode: string, opts: { userId?: number | null; claimToken?: string | null } = {}) {
  db.prepare('INSERT INTO qr_codes (short_code, target_url, user_id, claim_token) VALUES (?, ?, ?, ?)').run(
    shortCode,
    'https://example.com',
    opts.userId ?? null,
    opts.claimToken ?? null
  );
}

describe('claims', () => {
  it('mints high-entropy tokens and hashes them deterministically', () => {
    const a = newClaimToken();
    const b = newClaimToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(hashClaimToken(a)).toBe(hashClaimToken(a));
    expect(hashClaimToken(a)).not.toBe(hashClaimToken(b));
  });

  it('counts only unowned codes matching the token', () => {
    const ownerId = Number(
      db.prepare('INSERT INTO users (email) VALUES (?)').run('owner@example.com').lastInsertRowid
    );
    const token = hashClaimToken(newClaimToken());
    insertQr('claim1', { claimToken: token });
    insertQr('claim2', { claimToken: token });
    insertQr('other', { claimToken: hashClaimToken(newClaimToken()) });
    insertQr('owned', { userId: ownerId, claimToken: token });

    expect(countClaimableQrCodes(token)).toBe(2);
  });

  it('adopts matching anonymous codes and clears their tokens', () => {
    const userId = Number(
      db.prepare('INSERT INTO users (email) VALUES (?)').run('owner@example.com').lastInsertRowid
    );
    const token = hashClaimToken(newClaimToken());
    insertQr('claim1', { claimToken: token });
    insertQr('claim2', { claimToken: token });

    expect(adoptClaimedQrCodes(userId, token)).toBe(2);

    const rows = db
      .prepare('SELECT short_code, user_id, claim_token FROM qr_codes ORDER BY short_code')
      .all() as { short_code: string; user_id: number; claim_token: string | null }[];
    expect(rows.every((r) => r.user_id === userId && r.claim_token === null)).toBe(true);
    expect(countClaimableQrCodes(token)).toBe(0);
  });

  it('never adopts codes already owned by another user', () => {
    const otherId = Number(
      db.prepare('INSERT INTO users (email) VALUES (?)').run('other@example.com').lastInsertRowid
    );
    const meId = Number(
      db.prepare('INSERT INTO users (email) VALUES (?)').run('me@example.com').lastInsertRowid
    );
    const token = hashClaimToken(newClaimToken());
    insertQr('theirs', { userId: otherId, claimToken: token });

    expect(adoptClaimedQrCodes(meId, token)).toBe(0);
    const row = db.prepare('SELECT user_id FROM qr_codes WHERE short_code = ?').get('theirs') as { user_id: number };
    expect(row.user_id).toBe(otherId);
  });
});
