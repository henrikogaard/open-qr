import { createHash } from 'crypto';

/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed by user id (when authenticated) or a hash of the X-Forwarded-For chain
 * (anonymous). The raw IP never lands in the map — only a SHA-256 prefix, so
 * the limiter is consistent with the broader privacy stance.
 *
 * In-memory is intentional: a single-container Docker deployment is the
 * supported model. Multi-instance setups should put a real limiter at the
 * reverse proxy (Nginx, Cloudflare) — that's the standard advice for SQLite
 * apps anyway.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

// Periodic prune so the map can't grow unbounded over a long-running process.
let lastPrune = Date.now();
const PRUNE_INTERVAL_MS = 5 * 60_000;

function prune(now: number): void {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => t > now - WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
  lastPrune = now;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window opens up — useful for Retry-After. */
  retryAfter: number;
  /** Remaining requests in the current window (0 when blocked). */
  remaining: number;
}

export function checkRateLimit(key: string, limitPerMinute: number): RateLimitResult {
  if (limitPerMinute <= 0) {
    return { allowed: true, retryAfter: 0, remaining: Number.POSITIVE_INFINITY };
  }

  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > now - WINDOW_MS);

  if (bucket.hits.length >= limitPerMinute) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfter, remaining: 0 };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    retryAfter: 0,
    remaining: limitPerMinute - bucket.hits.length
  };
}

export function buildLimiterKey(userId: number | null | undefined, request: Request): string {
  if (userId) return `u:${userId}`;
  const fwd = request.headers.get('x-forwarded-for') || 'local';
  const ip = fwd.split(',')[0].trim() || 'local';
  return 'ip:' + createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

/** For tests. */
export function _resetRateLimit(): void {
  buckets.clear();
  lastPrune = Date.now();
}
