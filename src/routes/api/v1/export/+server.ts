import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { toCsv } from '$lib/server/csv';
import { getSetting } from '$lib/server/settings';

/**
 * Self-service data export (GDPR-friendly): the signed-in user's own data.
 *
 *   ?type=codes — one row per QR code with style/config and scan totals
 *   ?type=scans — raw scan log rows for the user's codes (bots included,
 *                 identifiable via device_class)
 *
 * Response is text/csv with an attachment disposition.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  const type = url.searchParams.get('type') ?? 'codes';
  const base = (getSetting('PUBLIC_BASE_URL', '').trim() || url.origin).replace(/\/+$/, '');

  let rows: (string | number | boolean | null)[][];
  let filename: string;

  if (type === 'codes') {
    rows = [
      ['short_code', 'short_url', 'target_url', 'created_at', 'expires_at', 'is_active', 'scan_count', 'campaign', 'password_protected', 'template'],
      ...(
        db
          .prepare(
            `SELECT q.short_code, q.target_url, q.created_at, q.expires_at, q.is_active,
                    q.scan_count, c.name AS campaign, q.password_hash IS NOT NULL AS has_password, q.template
             FROM qr_codes q LEFT JOIN campaigns c ON c.id = q.campaign_id
             WHERE q.user_id = ?
             ORDER BY q.created_at DESC`
          )
          .all(locals.user.id) as {
            short_code: string; target_url: string; created_at: string; expires_at: string | null;
            is_active: number; scan_count: number; campaign: string | null; has_password: number; template: string;
          }[]
      ).map((q) => [
        q.short_code,
        base ? `${base}/go/${q.short_code}` : `/go/${q.short_code}`,
        q.target_url,
        q.created_at,
        q.expires_at,
        q.is_active === 1,
        q.scan_count,
        q.campaign,
        q.has_password === 1,
        q.template
      ])
    ];
    filename = 'openqr-codes.csv';
  } else if (type === 'scans') {
    rows = [
      ['short_code', 'timestamp', 'country', 'device_class'],
      ...(
        db
          .prepare(
            `SELECT q.short_code, s.timestamp, s.country, s.device_class
             FROM scan_logs s JOIN qr_codes q ON q.id = s.qr_code_id
             WHERE q.user_id = ?
             ORDER BY s.timestamp DESC
             LIMIT 100000`
          )
          .all(locals.user.id) as { short_code: string; timestamp: string; country: string | null; device_class: string | null }[]
      ).map((s) => [s.short_code, s.timestamp, s.country, s.device_class])
    ];
    filename = 'openqr-scans.csv';
  } else {
    throw error(400, 'Unknown export type. Use ?type=codes or ?type=scans');
  }

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
};
