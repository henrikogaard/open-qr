import { db } from '$lib/db';

/**
 * Alternative targets for a dynamic QR code.
 *
 * Two behaviors share one table:
 * - Scheduled override: weight 0. While its [starts_at, ends_at] window
 *   contains "now" it wins outright — e.g. "point to /live during the event,
 *   back to the replay page after". Multiple overlapping windows resolve to
 *   the most recently started one, so a later schedule supersedes an earlier.
 * - A/B split: weight > 0. All in-window weighted variants share traffic
 *   proportionally to their weights; scans record which variant served.
 *
 * When nothing applies (no window active, or only weight-0 rows outside their
 * windows) the QR falls back to its main target_url.
 */

export interface QrVariant {
  id: number;
  qr_code_id: number;
  label: string | null;
  target_url: string;
  weight: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
}

export interface VariantInput {
  label?: unknown;
  targetUrl?: unknown;
  weight?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  isActive?: unknown;
}

export interface ResolvedTarget {
  url: string;
  variantId: number | null;
  variantLabel: string | null;
}

function parseWindowDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a date/time string`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is not a valid date/time`);
  return value;
}

/**
 * Validates shape (not URL safety — the API layer runs the full URL checks
 * before calling this) and replaces the variant set atomically.
 */
export function replaceVariants(qrCodeId: number, inputs: VariantInput[]): void {
  if (!Array.isArray(inputs)) throw new Error('variants must be an array');
  if (inputs.length > 10) throw new Error('A QR code can have at most 10 target variants');

  const rows = inputs.map((input) => {
    if (!input || typeof input !== 'object') throw new Error('Each variant must be an object');
    const targetUrl = typeof input.targetUrl === 'string' ? input.targetUrl.trim() : '';
    if (!targetUrl) throw new Error('Each variant needs a target URL');
    if (targetUrl.length > 2048) throw new Error('Variant target URL is too long');

    let weight = 0;
    if (input.weight !== undefined && input.weight !== null && input.weight !== '') {
      weight = Number(input.weight);
      if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
        throw new Error('Variant weight must be an integer between 0 and 100');
      }
    }

    const label =
      typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 60) : null;
    const starts_at = parseWindowDate(input.startsAt, 'Variant start');
    const ends_at = parseWindowDate(input.endsAt, 'Variant end');
    if (starts_at && ends_at && new Date(starts_at) > new Date(ends_at)) {
      throw new Error('Variant start must be before its end');
    }

    return {
      targetUrl,
      weight,
      label,
      starts_at,
      ends_at,
      is_active: input.isActive === false || input.isActive === 0 ? 0 : 1
    };
  });

  const insert = db.prepare(`
    INSERT INTO qr_variants (qr_code_id, label, target_url, weight, starts_at, ends_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    db.prepare('DELETE FROM qr_variants WHERE qr_code_id = ?').run(qrCodeId);
    for (const row of rows) {
      insert.run(qrCodeId, row.label, row.targetUrl, row.weight, row.starts_at, row.ends_at, row.is_active);
    }
  })();
}

export function listVariants(qrCodeId: number): QrVariant[] {
  return db
    .prepare('SELECT * FROM qr_variants WHERE qr_code_id = ? ORDER BY id')
    .all(qrCodeId) as QrVariant[];
}

function inWindow(v: QrVariant, now: number): boolean {
  if (v.starts_at && new Date(v.starts_at).getTime() > now) return false;
  if (v.ends_at && new Date(v.ends_at).getTime() < now) return false;
  return true;
}

function pickWeighted(
  candidates: QrVariant[],
  random: () => number
): QrVariant {
  const total = candidates.reduce((sum, v) => sum + v.weight, 0);
  let roll = random() * total;
  for (const v of candidates) {
    roll -= v.weight;
    if (roll < 0) return v;
  }
  return candidates[candidates.length - 1];
}

/**
 * Decides where a scan goes right now. Scheduled overrides beat the split;
 * the split only sees weight>0 variants whose window (if any) is open.
 */
export function resolveTarget(
  qr: { id: number; target_url: string },
  deps: { now?: number; random?: () => number } = {}
): ResolvedTarget {
  const now = deps.now ?? Date.now();
  const random = deps.random ?? Math.random;
  const variants = listVariants(qr.id).filter((v) => v.is_active);

  const scheduled = variants
    .filter((v) => v.weight === 0 && inWindow(v, now))
    // Latest-starting window wins, so newer schedules supersede older ones.
    .sort((a, b) => new Date(b.starts_at || 0).getTime() - new Date(a.starts_at || 0).getTime());

  const winner = scheduled[0] ?? null;
  if (winner) {
    return { url: winner.target_url, variantId: winner.id, variantLabel: winner.label };
  }

  const split = variants.filter((v) => v.weight > 0 && inWindow(v, now));
  if (split.length > 0) {
    // Weights are percentages of overall traffic: a 30% variant serves ~30%
    // of scans and the remainder falls back to the QR's main target_url.
    // (Capped at 100 so over-subscribed splits normalize to always-variant.)
    const totalWeight = Math.min(
      100,
      split.reduce((sum, v) => sum + v.weight, 0)
    );
    if (random() * 100 < totalWeight) {
      const chosen = pickWeighted(split, random);
      return { url: chosen.target_url, variantId: chosen.id, variantLabel: chosen.label };
    }
  }

  return { url: qr.target_url, variantId: null, variantLabel: null };
}
