import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAbuseReports, updateAbuseReportStatus } from '$lib/server/abuse-reports';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) throw error(403, 'Admin access required');
  return json({ success: true, data: listAbuseReports(url.searchParams.get('status') || 'all') });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) throw error(403, 'Admin access required');
  const body = await request.json();
  try {
    updateAbuseReportStatus(Number(body.id), String(body.status));
    return json({ success: true, data: listAbuseReports() });
  } catch (err: any) {
    throw error(400, err?.message || 'Bad request');
  }
};
