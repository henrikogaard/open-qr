import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createQRCode } from '$lib/server/qr';
import { getBooleanSetting } from '$lib/server/settings';
import { buildShortUrl } from '$lib/server/urls';
import { parseCsv } from '$lib/server/csv';
import { assertSafeTargetUrl } from '$lib/server/url-safety';
import { getCampaign } from '$lib/server/campaigns';

// Caps on a single bulk request. Adapter-node's BODY_SIZE_LIMIT (default
// 512 KB) provides a hard backstop; these limits are the friendly errors
// the API surfaces before doing any work.
const MAX_BULK_BODY_BYTES = 512 * 1024;
const MAX_BULK_ROWS = 1000;

/**
 * Bulk CSV import.
 *
 * Body: text/csv (or text/plain) where row 1 is the header and subsequent rows
 * are records. Recognised columns (case-insensitive):
 *   targetUrl (required)
 *   template, foregroundColor, backgroundColor, borderSize, borderStyle,
 *   centerType, centerText, centerTextColor, errorCorrection,
 *   expiresAt, password, campaignId
 *
 * Returns per-row results so the caller can show partial-success state.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
  const allowAnonymous = getBooleanSetting('ENABLE_ANONYMOUS_CREATION', true);
  if (!locals.user && !allowAnonymous) {
    throw error(401, 'Authentication required');
  }

  const body = await request.text();
  if (!body.trim()) {
    throw error(400, 'Empty body');
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BULK_BODY_BYTES) {
    throw error(413, `CSV body exceeds ${MAX_BULK_BODY_BYTES} bytes`);
  }

  const rows = parseCsv(body);
  if (rows.length < 2) {
    throw error(400, 'CSV must include a header row and at least one data row');
  }
  if (rows.length - 1 > MAX_BULK_ROWS) {
    throw error(400, `Too many rows (${rows.length - 1}); max ${MAX_BULK_ROWS} per request`);
  }

  const header = rows[0].map((h) => h.trim());
  const targetUrlIdx = header.findIndex((h) => h.toLowerCase() === 'targeturl');
  if (targetUrlIdx === -1) {
    throw error(400, 'CSV header must include a "targetUrl" column');
  }

  const styleKeys = [
    'template',
    'foregroundColor',
    'backgroundColor',
    'borderSize',
    'borderStyle',
    'centerType',
    'centerText',
    'centerTextColor',
    'errorCorrection'
  ] as const;

  const indexFor = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const results: { row: number; success: boolean; shortCode?: string; shortUrl?: string; error?: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const targetUrl = cells[targetUrlIdx]?.trim();
    if (!targetUrl) {
      results.push({ row: i + 1, success: false, error: 'targetUrl is empty' });
      continue;
    }

    const style: Record<string, string> = {};
    for (const key of styleKeys) {
      const idx = indexFor(key);
      if (idx !== -1 && cells[idx]) style[key] = cells[idx].trim();
    }
    const expiresAt = cells[indexFor('expiresAt')]?.trim() || undefined;
    const password = cells[indexFor('password')]?.trim() || undefined;
    const campaignIdRaw = cells[indexFor('campaignId')]?.trim();
    const campaignId = campaignIdRaw ? Number(campaignIdRaw) : undefined;

    try {
      await assertSafeTargetUrl(targetUrl);
      if (campaignId && (!locals.user || !getCampaign(campaignId, locals.user.id))) {
        throw new Error('Campaign not found');
      }
      const { shortCode } = createQRCode(
        targetUrl,
        locals.user?.id || null,
        style,
        undefined,
        expiresAt,
        password,
        campaignId
      );
      results.push({
        row: i + 1,
        success: true,
        shortCode,
        shortUrl: buildShortUrl(shortCode, url.origin)
      });
    } catch (err: any) {
      results.push({
        row: i + 1,
        success: false,
        error: err?.message || 'Unknown error'
      });
    }
  }

  const created = results.filter((r) => r.success).length;
  return json({
    success: true,
    data: { created, failed: results.length - created, results }
  });
};
