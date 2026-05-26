import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { createAbuseReport, listAbuseReports, updateAbuseReportStatus } from './abuse-reports';
import { createQRCode } from './qr';

describe('abuse reports', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM abuse_reports').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM settings').run();
  });

  it('stores reports against known QR codes and lets admins resolve them', () => {
    const { shortCode } = createQRCode('https://example.com/problem', null);
    const report = createAbuseReport(shortCode, {
      reason: 'phishing',
      details: 'Looks like a fake login',
      reporterEmail: 'reporter@example.com'
    });

    expect(report.target_url).toBe('https://example.com/problem');
    expect(listAbuseReports()[0].status).toBe('open');

    updateAbuseReportStatus(report.id, 'resolved');
    expect(listAbuseReports()[0].status).toBe('resolved');
  });
});
