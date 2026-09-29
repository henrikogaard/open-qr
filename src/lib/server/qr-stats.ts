import { db } from '$lib/db';

/**
 * Per-QR analytics queries shared by the stats page load and
 * /api/v1/qr/:code/stats. Series/breakdowns respect the requested range and
 * granularity; totals stay all-time.
 *
 * Uniques use COUNT(DISTINCT ip_hash) over human scans — approximate devices
 * rather than people, consistent with the no-fingerprinting stance (the hash
 * is already stored; it is only ever counted, never exposed).
 */

export type Granularity = 'day' | 'hour';

export interface StatsRange {
  from: Date;
  to: Date;
  granularity: Granularity;
}

const HUMAN_FILTER = '(device_class IS NULL OR device_class != \'bot\')';
const MAX_HOUR_BUCKETS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 365;

export function defaultRange(): StatsRange {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to, granularity: 'day' };
}

/** Parses and clamps ?from&to&granularity into a sane range. */
export function parseRange(params: URLSearchParams): StatsRange {
  const fallback = defaultRange();
  const from = params.get('from') ? new Date(String(params.get('from'))) : fallback.from;
  const to = params.get('to') ? new Date(String(params.get('to'))) : fallback.to;
  const granularity: Granularity = params.get('granularity') === 'hour' ? 'hour' : 'day';

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fallback;

  let clampedTo = to;
  let clampedFrom = from;
  if (clampedFrom > clampedTo) [clampedFrom, clampedTo] = [clampedTo, clampedFrom];
  if (clampedTo.getTime() - clampedFrom.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    clampedFrom = new Date(clampedTo.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
  }
  if (granularity === 'hour' && clampedTo.getTime() - clampedFrom.getTime() > MAX_HOUR_BUCKETS_MS) {
    clampedFrom = new Date(clampedTo.getTime() - MAX_HOUR_BUCKETS_MS);
  }
  return { from: clampedFrom, to: clampedTo, granularity };
}

function sqlDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export interface QrStatsResult {
  range: { from: string; to: string; granularity: Granularity };
  series: { bucket: string; count: number; uniques: number }[];
  byCountry: { country: string; count: number }[];
  byDevice: { device_class: string; count: number }[];
  byVariant: { label: string | null; targetUrl: string; count: number }[];
  recentScans: { timestamp: string; country: string | null; device_class: string | null }[];
  totalScans: number;
  uniqueScans: number;
  hasVariants: boolean;
}

export function qrScanStats(qrId: number, qrScanCount: number, range: StatsRange): QrStatsResult {
  const fromSql = sqlDate(range.from);
  const toSql = sqlDate(range.to);
  const rangeFilter = (col: string) =>
    `datetime(${col}) >= datetime('${fromSql}') AND datetime(${col}) <= datetime('${toSql}')`;

  const bucketExpr =
    range.granularity === 'hour'
      ? `strftime('%Y-%m-%dT%H:00', timestamp)`
      : `strftime('%Y-%m-%d', timestamp)`;

  const series = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS count, COUNT(DISTINCT ip_hash) AS uniques
       FROM scan_logs
       WHERE qr_code_id = ? AND ${rangeFilter('timestamp')} AND ${HUMAN_FILTER}
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(qrId) as { bucket: string; count: number; uniques: number }[];

  const byCountry = db
    .prepare(
      `SELECT country, COUNT(*) AS count
       FROM scan_logs
       WHERE qr_code_id = ? AND ${rangeFilter('timestamp')} AND country IS NOT NULL AND ${HUMAN_FILTER}
       GROUP BY country
       ORDER BY count DESC`
    )
    .all(qrId) as { country: string; count: number }[];

  const byDevice = db
    .prepare(
      `SELECT device_class, COUNT(*) AS count
       FROM scan_logs
       WHERE qr_code_id = ? AND ${rangeFilter('timestamp')} AND device_class IS NOT NULL
       GROUP BY device_class
       ORDER BY count DESC`
    )
    .all(qrId) as { device_class: string; count: number }[];

  const variantCount = (
    db.prepare('SELECT COUNT(*) AS count FROM qr_variants WHERE qr_code_id = ?').get(qrId) as {
      count: number;
    }
  ).count;

  const byVariant = variantCount
    ? (db
        .prepare(
          `SELECT COALESCE(v.label, v.target_url) AS label, v.target_url AS targetUrl, COUNT(*) AS count
           FROM scan_logs s
           JOIN qr_variants v ON v.id = s.variant_id
           WHERE s.qr_code_id = ? AND ${rangeFilter('s.timestamp')}
           GROUP BY v.id
           ORDER BY count DESC`
        )
        .all(qrId) as { label: string | null; targetUrl: string; count: number }[])
    : [];

  const uniqueScans = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT ip_hash) AS count FROM scan_logs
         WHERE qr_code_id = ? AND ${HUMAN_FILTER}`
      )
      .get(qrId) as { count: number }
  ).count;

  const recentScans = db
    .prepare(
      `SELECT timestamp, country, device_class FROM scan_logs
       WHERE qr_code_id = ? AND ${HUMAN_FILTER}
       ORDER BY timestamp DESC LIMIT 100`
    )
    .all(qrId) as { timestamp: string; country: string | null; device_class: string | null }[];

  return {
    range: { from: fromSql, to: toSql, granularity: range.granularity },
    series,
    byCountry,
    byDevice,
    byVariant,
    recentScans,
    totalScans: qrScanCount,
    uniqueScans,
    hasVariants: variantCount > 0
  };
}
