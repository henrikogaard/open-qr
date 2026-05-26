import { db } from '$lib/db';
import { getQRCode } from './qr';

export interface AbuseReportInput {
  reason: string;
  details?: string;
  reporterEmail?: string;
}

export interface AbuseReport {
  id: number;
  qr_code_id: number | null;
  short_code: string;
  target_url: string | null;
  reason: string;
  details: string | null;
  reporter_email: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function createAbuseReport(shortCode: string, input: AbuseReportInput): AbuseReport {
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required');
  if (reason.length > 80) throw new Error('Reason must be 80 characters or fewer');

  const qr = getQRCode(shortCode);
  const result = db
    .prepare(
      `INSERT INTO abuse_reports
        (qr_code_id, short_code, target_url, reason, details, reporter_email)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      qr?.id || null,
      shortCode,
      qr?.target_url || null,
      reason,
      input.details?.trim() || null,
      input.reporterEmail?.trim() || null
    );

  return db.prepare('SELECT * FROM abuse_reports WHERE id = ?').get(result.lastInsertRowid) as AbuseReport;
}

export function listAbuseReports(status = 'all'): AbuseReport[] {
  if (status !== 'all') {
    return db
      .prepare('SELECT * FROM abuse_reports WHERE status = ? ORDER BY created_at DESC')
      .all(status) as AbuseReport[];
  }
  return db.prepare('SELECT * FROM abuse_reports ORDER BY created_at DESC').all() as AbuseReport[];
}

export function updateAbuseReportStatus(id: number, status: string): void {
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    throw new Error('Invalid report status');
  }
  db.prepare(
    `UPDATE abuse_reports
     SET status = ?, resolved_at = CASE WHEN ? IN ('resolved', 'dismissed') THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = ?`
  ).run(status, status, id);
}
