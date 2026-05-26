import QRCode from 'qrcode';
import { createCanvas, loadImage } from 'canvas';
import { db } from '$lib/db';
import { nanoid } from 'nanoid';
import { isAllowedScheme, isBlacklisted } from './blacklist';
import { hashSecret, verifySecret } from './auth';
import { getNumberSetting } from './settings';

function assertUsableTargetUrl(url: string): void {
  const scheme = isAllowedScheme(url);
  if (!scheme.allowed) throw new Error(scheme.reason!);
  const blacklist = isBlacklisted(url);
  if (blacklist.blocked) throw new Error(`URL blocked: ${blacklist.reason}`);
}

function assertEncodableUrl(url: string): void {
  const scheme = isAllowedScheme(url);
  if (!scheme.allowed) throw new Error(scheme.reason!);
}

/**
 * Throws if the user has hit the MAX_QR_PER_USER cap. `0` means unlimited.
 * Anonymous codes (userId null) are not capped here — they're already
 * bounded by the global /api/* rate limiter.
 */
function assertUnderQuota(userId: number | null): void {
  if (!userId) return;
  const cap = getNumberSetting('MAX_QR_PER_USER', 0);
  if (cap <= 0) return;
  const row = db
    .prepare('SELECT COUNT(*) as count FROM qr_codes WHERE user_id = ?')
    .get(userId) as { count: number };
  if (row.count >= cap) {
    throw new Error(`Per-user QR limit reached (${cap})`);
  }
}

export interface QRStyle {
  template?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  borderSize?: string;
  borderStyle?: string;
  centerType?: string;
  centerImageUrl?: string;
  centerText?: string;
  centerTextColor?: string;
  errorCorrection?: string;
}

type ModuleShape = 'square' | 'rounded' | 'minimal';
type ModuleFill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string };

interface ResolvedTemplate {
  shape: ModuleShape;
  fill: ModuleFill;
  bg: string;
  border: string;
}

export function generateShortCode(): string {
  return nanoid(8);
}

function resolveTemplate(style: QRStyle): ResolvedTemplate {
  const fg = style.foregroundColor || '#000000';
  const bg = style.backgroundColor || '#FFFFFF';
  switch (style.template) {
    case 'rounded':
      return { shape: 'rounded', fill: { type: 'solid', color: fg }, bg, border: fg };
    case 'minimal':
      return { shape: 'minimal', fill: { type: 'solid', color: fg }, bg, border: fg };
    case 'dark':
      // Preset overrides colors for a high-contrast dark look.
      return {
        shape: 'rounded',
        fill: { type: 'solid', color: '#ebdbb2' },
        bg: '#1d2021',
        border: '#ebdbb2'
      };
    case 'colorful':
      return {
        shape: 'rounded',
        fill: { type: 'gradient', from: fg, to: '#d65d0e' },
        bg,
        border: fg
      };
    default:
      return { shape: 'square', fill: { type: 'solid', color: fg }, bg, border: fg };
  }
}

function resolveErrorCorrection(style: QRStyle): QRCode.QRCodeErrorCorrectionLevel {
  const ecLevel = (style.errorCorrection || 'M').toUpperCase() as QRCode.QRCodeErrorCorrectionLevel;
  const validLevels: QRCode.QRCodeErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];
  return validLevels.includes(ecLevel) ? ecLevel : 'M';
}

interface DrawableMatrix {
  size: number;
  /** Returns true if the module at (col, row) is dark. */
  isDark(col: number, row: number): boolean;
}

function buildMatrix(targetUrl: string, ec: QRCode.QRCodeErrorCorrectionLevel): DrawableMatrix {
  const qr = QRCode.create(targetUrl, { errorCorrectionLevel: ec });
  const size = qr.modules.size;
  const data = qr.modules.data as Uint8Array;
  return {
    size,
    isDark(col, row) {
      return data[row * size + col] === 1;
    }
  };
}

function drawModule(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  s: number,
  shape: ModuleShape
): void {
  switch (shape) {
    case 'minimal': {
      const pad = s * 0.12;
      ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      return;
    }
    case 'rounded': {
      const r = s * 0.35;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + s, y, x + s, y + s, r);
      ctx.arcTo(x + s, y + s, x, y + s, r);
      ctx.arcTo(x, y + s, x, y, r);
      ctx.arcTo(x, y, x + s, y, r);
      ctx.closePath();
      ctx.fill();
      return;
    }
    default:
      ctx.fillRect(x, y, s, s);
  }
}

function applyFill(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  fill: ModuleFill,
  width: number,
  height: number
): void {
  if (fill.type === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, fill.from);
    grad.addColorStop(1, fill.to);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = fill.color;
  }
}

export async function generateQRImage(
  targetUrl: string,
  style: QRStyle = {}
): Promise<string> {
  assertEncodableUrl(targetUrl);

  const ec = resolveErrorCorrection(style);
  const tpl = resolveTemplate(style);
  const baseSize = 400;
  const borderSize = getBorderPixels(style.borderSize || 'medium');
  const totalSize = baseSize + borderSize * 2;

  const canvas = createCanvas(totalSize, totalSize);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = tpl.bg;
  ctx.fillRect(0, 0, totalSize, totalSize);

  const matrix = buildMatrix(targetUrl, ec);
  const margin = 2;
  const moduleSize = baseSize / (matrix.size + margin * 2);
  const originX = borderSize;
  const originY = borderSize;

  applyFill(ctx, tpl.fill, totalSize, totalSize);

  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.isDark(col, row)) continue;
      const x = originX + (col + margin) * moduleSize;
      const y = originY + (row + margin) * moduleSize;
      drawModule(ctx, x, y, moduleSize, tpl.shape);
    }
  }

  if (style.borderSize !== 'none' && borderSize > 0) {
    ctx.strokeStyle = tpl.border;
    ctx.lineWidth = 4;

    if (style.borderStyle === 'dashed') {
      ctx.setLineDash([10, 10]);
    } else if (style.borderStyle === 'dotted') {
      ctx.setLineDash([5, 5]);
    }

    ctx.strokeRect(borderSize / 2, borderSize / 2, baseSize + borderSize, baseSize + borderSize);
    ctx.setLineDash([]);
  }

  if (style.centerType === 'image' && style.centerImageUrl) {
    await addCenterImage(ctx, canvas, style.centerImageUrl);
  } else if (style.centerType === 'text' && style.centerText) {
    addCenterText(ctx, canvas, style.centerText, style.centerTextColor || '#000000', tpl.bg);
  }

  return canvas.toDataURL('image/png');
}

function svgModule(x: number, y: number, s: number, shape: ModuleShape): string {
  switch (shape) {
    case 'minimal': {
      const pad = s * 0.12;
      return `<rect x="${x + pad}" y="${y + pad}" width="${s - pad * 2}" height="${s - pad * 2}"/>`;
    }
    case 'rounded': {
      const r = s * 0.35;
      return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" ry="${r}"/>`;
    }
    default:
      return `<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;'
  );
}

const INLINE_IMAGE_MAX_BYTES = 1_000_000;
const INLINE_IMAGE_ALLOWED = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif']);

/**
 * Resolves a center-image URL to an embeddable form for SVG. Already-inlined
 * data URLs pass through; http(s) URLs are fetched and base64-encoded so the
 * exported SVG is self-contained offline. Returns null on any failure (caller
 * falls back to omitting the overlay).
 */
async function resolveInlineImage(imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  if (!/^https?:\/\//i.test(imageUrl)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!INLINE_IMAGE_ALLOWED.has(contentType)) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > INLINE_IMAGE_MAX_BYTES) return null;
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function generateQRSVG(
  targetUrl: string,
  style: QRStyle = {}
): Promise<string> {
  assertEncodableUrl(targetUrl);

  const ec = resolveErrorCorrection(style);
  const tpl = resolveTemplate(style);
  const matrix = buildMatrix(targetUrl, ec);
  const margin = 2;
  const baseSize = 400;
  const borderSize = getBorderPixels(style.borderSize || 'medium');
  const totalSize = baseSize + borderSize * 2;
  const moduleSize = baseSize / (matrix.size + margin * 2);

  let modules = '';
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.isDark(col, row)) continue;
      const x = borderSize + (col + margin) * moduleSize;
      const y = borderSize + (row + margin) * moduleSize;
      modules += svgModule(x, y, moduleSize, tpl.shape);
    }
  }

  let defs = '';
  let fillAttr: string;
  if (tpl.fill.type === 'gradient') {
    defs = `<defs><linearGradient id="qrFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tpl.fill.from}"/><stop offset="1" stop-color="${tpl.fill.to}"/></linearGradient></defs>`;
    fillAttr = 'fill="url(#qrFill)"';
  } else {
    fillAttr = `fill="${tpl.fill.color}"`;
  }

  // Decorative border (matches the PNG: drawn as a stroked rect along the inner
  // edge of the padding area).
  let borderRect = '';
  if (style.borderSize !== 'none' && borderSize > 0) {
    const dash =
      style.borderStyle === 'dashed'
        ? ' stroke-dasharray="10,10"'
        : style.borderStyle === 'dotted'
          ? ' stroke-dasharray="5,5"'
          : '';
    borderRect = `<rect x="${borderSize / 2}" y="${borderSize / 2}" width="${baseSize + borderSize}" height="${baseSize + borderSize}" fill="none" stroke="${tpl.border}" stroke-width="4"${dash}/>`;
  }

  // Center overlay — text inline; images become an <image href="…"> element.
  let overlay = '';
  const overlaySize = totalSize * 0.2;
  const cx = totalSize / 2;
  const cy = totalSize / 2;
  if (style.centerType === 'text' && style.centerText) {
    const text = escapeXml(style.centerText.substring(0, 10));
    const textColor = style.centerTextColor || '#000000';
    const boxSize = overlaySize;
    const boxH = boxSize / 1.5;
    overlay =
      `<rect x="${cx - boxSize / 2}" y="${cy - boxH / 2}" width="${boxSize}" height="${boxH}" fill="${tpl.bg}"/>` +
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="700" font-size="${boxSize / 3}" fill="${textColor}">${text}</text>`;
  } else if (style.centerType === 'image' && style.centerImageUrl) {
    const inlined = await resolveInlineImage(style.centerImageUrl);
    if (inlined) {
      overlay = `<image href="${escapeXml(inlined)}" x="${cx - overlaySize / 2}" y="${cy - overlaySize / 2}" width="${overlaySize}" height="${overlaySize}"/>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" shape-rendering="geometricPrecision">${defs}<rect width="${totalSize}" height="${totalSize}" fill="${tpl.bg}"/><g ${fillAttr}>${modules}</g>${borderRect}${overlay}</svg>`;
}

function getBorderPixels(size: string): number {
  switch (size) {
    case 'small': return 10;
    case 'medium': return 20;
    case 'large': return 40;
    default: return 0;
  }
}

async function addCenterImage(ctx: any, canvas: any, imageUrl: string): Promise<void> {
  try {
    const size = Math.min(canvas.width, canvas.height) * 0.2;
    const x = (canvas.width - size) / 2;
    const y = (canvas.height - size) / 2;
    
    const img = await loadImage(imageUrl);
    ctx.drawImage(img, x, y, size, size);
  } catch {
    // Silently fail if image can't be loaded
  }
}

function addCenterText(ctx: any, canvas: any, text: string, color: string, bgColor: string): void {
  const size = Math.min(canvas.width, canvas.height) * 0.2;
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(x - size / 2, y - size / 3, size, size / 1.5);
  
  ctx.fillStyle = color;
  ctx.font = `bold ${size / 3}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.substring(0, 10), x, y);
}

export function createQRCode(
  targetUrl: string,
  userId: number | null,
  style: QRStyle = {},
  shortCode?: string,
  expiresAt?: string,
  password?: string,
  campaignId?: number | null
): { shortCode: string } {
  assertUsableTargetUrl(targetUrl);
  assertUnderQuota(userId);

  const code = shortCode || generateShortCode();
  
  db.prepare(`
    INSERT INTO qr_codes (
      short_code, target_url, user_id, expires_at, password_hash,
      template, foreground_color, background_color, border_size, border_style,
      center_type, center_image_url, center_text, center_text_color, error_correction,
      campaign_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    code,
    targetUrl,
    userId,
    expiresAt || null,
    password ? hashSecret(password) : null,
    style.template || 'default',
    style.foregroundColor || '#000000',
    style.backgroundColor || '#FFFFFF',
    style.borderSize || 'medium',
    style.borderStyle || 'solid',
    style.centerType || 'none',
    style.centerImageUrl || null,
    style.centerText || null,
    style.centerTextColor || '#000000',
    style.errorCorrection || 'M',
    campaignId || null
  );
  
  return { shortCode: code };
}

export function getQRCode(shortCode: string) {
  return db.prepare('SELECT * FROM qr_codes WHERE short_code = ?').get(shortCode) as any;
}

export function updateQRCode(shortCode: string, updates: Partial<any>) {
  const allowedFields = [
    'target_url', 'expires_at', 'password_hash', 'is_active',
    'template', 'foreground_color', 'background_color', 'border_size', 'border_style',
    'center_type', 'center_image_url', 'center_text', 'center_text_color', 'error_correction',
    'campaign_id'
  ];
  
  const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
  if (fields.length === 0) return;
  const updateValues = updates as Record<string, unknown>;

  if (fields.includes('target_url')) {
    const targetUrl = updates.target_url;
    if (typeof targetUrl !== 'string' || !targetUrl) {
      throw new Error('Target URL is required');
    }

    assertUsableTargetUrl(targetUrl);
  }

  if (fields.includes('password_hash') && updates.password_hash) {
    updates.password_hash = hashSecret(String(updates.password_hash));
  }
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updateValues[f]);
  
  db.prepare(`UPDATE qr_codes SET ${setClause} WHERE short_code = ?`).run(...values, shortCode);
}

export function deleteQRCode(shortCode: string): void {
  db.prepare('DELETE FROM qr_codes WHERE short_code = ?').run(shortCode);
}

export function listQRCodes(userId?: number): any[] {
  if (userId) {
    return db.prepare('SELECT * FROM qr_codes WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  }
  return db.prepare('SELECT * FROM qr_codes ORDER BY created_at DESC').all() as any[];
}

export function incrementScanCount(shortCode: string): void {
  db.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE short_code = ?').run(shortCode);
}

export function verifyQRPassword(passwordHash: string | null | undefined, password: string | null | undefined): boolean {
  return verifySecret(passwordHash, password);
}
