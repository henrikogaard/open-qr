import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getQRCode } from '$lib/server/qr';
import { createAbuseReport } from '$lib/server/abuse-reports';
import { buildLimiterKey, checkRateLimit } from '$lib/server/rate-limit';

export const load: PageServerLoad = async ({ params }) => {
  const qr = getQRCode(params.short_code);
  return {
    shortCode: params.short_code,
    targetHost: qr ? new URL(qr.target_url).hostname : null
  };
};

export const actions: Actions = {
  default: async ({ request, params, getClientAddress }) => {
    // Form actions sit outside the /api/* limiter in hooks.server.ts, so the
    // report queue needs its own cap or it's a free spam channel into admin.
    const key = 'report:' + buildLimiterKey(null, request, getClientAddress);
    const limit = checkRateLimit(key, 5);
    if (!limit.allowed) {
      return fail(429, { error: `Too many reports. Try again in ${limit.retryAfter}s.` });
    }

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
