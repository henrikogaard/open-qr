import { db } from '$lib/db';
import type { QRStyle } from './qr';

export interface StylePreset extends Required<Omit<QRStyle, 'centerImageUrl'>> {
  id: number;
  name: string;
  createdAt: string;
}

const STYLE_FIELDS = [
  'template',
  'foreground_color',
  'background_color',
  'border_size',
  'border_style',
  'center_type',
  'center_text',
  'center_text_color',
  'error_correction'
] as const;

function rowToPreset(row: any): StylePreset {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    foregroundColor: row.foreground_color,
    backgroundColor: row.background_color,
    borderSize: row.border_size,
    borderStyle: row.border_style,
    centerType: row.center_type,
    centerText: row.center_text ?? '',
    centerTextColor: row.center_text_color,
    errorCorrection: row.error_correction,
    createdAt: row.created_at
  };
}

export function listStylePresets(userId: number): StylePreset[] {
  const rows = db
    .prepare(
      `SELECT id, name, ${STYLE_FIELDS.join(', ')}, created_at
       FROM style_presets
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId);
  return rows.map(rowToPreset);
}

export function createStylePreset(
  userId: number,
  name: string,
  style: QRStyle
): StylePreset {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Preset name is required');

  const result = db
    .prepare(
      `INSERT INTO style_presets
         (user_id, name, template, foreground_color, background_color, border_size,
          border_style, center_type, center_text, center_text_color, error_correction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      trimmedName,
      style.template || 'default',
      style.foregroundColor || '#000000',
      style.backgroundColor || '#FFFFFF',
      style.borderSize || 'medium',
      style.borderStyle || 'solid',
      style.centerType || 'none',
      style.centerText || null,
      style.centerTextColor || '#000000',
      style.errorCorrection || 'M'
    );

  const row = db
    .prepare(
      `SELECT id, name, ${STYLE_FIELDS.join(', ')}, created_at
       FROM style_presets WHERE id = ?`
    )
    .get(Number(result.lastInsertRowid));
  return rowToPreset(row);
}

export function deleteStylePreset(userId: number, id: number): boolean {
  const result = db
    .prepare('DELETE FROM style_presets WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}
