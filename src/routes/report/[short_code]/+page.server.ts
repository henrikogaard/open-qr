import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getQRCode } from '$lib/server/qr';
import { createAbuseReport } from '$lib/server/abuse-reports';

export const load: PageServerLoad = async ({ params }) => {
  const qr = getQRCode(params.short_code);
  return {
    shortCode: params.short_code,
    targetHost: qr ? new URL(qr.target_url).hostname : null
  };
};

export const actions: Actions = {
  default: async ({ request, params }) => {
    const form = await request.formData();
    try {
      createAbuseReport(params.short_code, {
        reason: String(form.get('reason') || ''),
        details: String(form.get('details') || ''),
        reporterEmail: String(form.get('email') || '')
      });
      return { success: true };
    } catch (err: any) {
      return fail(400, { error: err?.message || 'Could not submit report' });
    }
  }
};
