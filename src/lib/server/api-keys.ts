import { db } from '$lib/db';
import { createHash, randomBytes } from 'crypto';

/**
 * API key issuance and verification.
 *
 * Format: `oqk_<48 hex chars>` (24 random bytes, ~192 bits of entropy).
 * Storage: SHA-256 of the full token, hex-encoded. Plaintext is shown to the
 * user exactly once at issuance and is unrecoverable afterward.
 *
 * SHA-256 is appropriate here (no pbkdf2 stretching): the token itself carries
 * enough entropy that brute-forcing it is infeasible. Using a fast hash also
 * lets us look up the row by hash in a single indexed read on every request.
 */

const TOKEN_PREFIX = 'oqk_';
const TOKEN_RANDOM_BYTES = 24;

export interface ApiKeyRow {
  id: number;
  user_id: number;
  name: string | null;
  last_used_at: string | null;
  created_at: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueApiKey(userId: number, name: string | null): { id: number; token: string } {
  const token = TOKEN_PREFIX + randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
  const tokenHash = hashToken(token);

  const result = db
    .prepare('INSERT INTO api_keys (user_id, key_hash, name) VALUES (?, ?, ?)')
    .run(userId, tokenHash, name?.trim() || null);

  return { id: Number(result.lastInsertRowid), token };
}

export function listApiKeys(userId: number): ApiKeyRow[] {
  return db
    .prepare(
      'SELECT id, user_id, name, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(userId) as ApiKeyRow[];
}

export function revokeApiKey(userId: number, id: number): boolean {
  const result = db
    .prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}

/**
 * Resolves a token (without `Bearer ` prefix) to its owning user. Updates
 * last_used_at on hit. Returns null if the token is unknown.
 */
export function getUserByApiKey(
  token: string
): { id: number; email: string; isAdmin: boolean } | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashToken(token);

  const row = db
    .prepare(
      `SELECT ak.id as key_id, u.id, u.email, u.is_admin
       FROM api_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.key_hash = ?`
    )
    .get(tokenHash) as { key_id: number; id: number; email: string; is_admin: number } | undefined;

  if (!row) return null;

  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.key_id);

  return {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin === 1
  };
}

/**
 * Extracts a token from either an `Authorization: Bearer <token>` header or an
 * `X-API-Key: <token>` header. Returns the raw token (without prefix) or null.
 */
export function extractApiKey(headers: Headers): string | null {
  const xApiKey = headers.get('x-api-key');
  if (xApiKey) return xApiKey.trim();

  const auth = headers.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(\S+)/i.exec(auth);
    if (match) return match[1];
  }

  return null;
}
