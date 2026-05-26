import { json, type Handle } from '@sveltejs/kit';
import { getUserBySession } from '$lib/server/auth';
import { extractApiKey, getUserByApiKey } from '$lib/server/api-keys';
import { runMigrations } from '$lib/db/schema';
import { getNumberSetting, initDefaultSettings } from '$lib/server/settings';
import { buildLimiterKey, checkRateLimit } from '$lib/server/rate-limit';

// Run migrations and init settings on startup
runMigrations();
initDefaultSettings();

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;

  const isApi = event.url.pathname.startsWith('/api/');

  if (isApi) {
    // API-key auth takes precedence on /api/* so machine clients with an
    // expired-cookie browser session can't accidentally fall through to it.
    const token = extractApiKey(event.request.headers);
    if (token) {
      const user = getUserByApiKey(token);
      if (user) event.locals.user = user;
    }
  }

  if (!event.locals.user) {
    const sessionCookie = event.cookies.get('auth_session');
    if (sessionCookie) {
      const user = getUserBySession(sessionCookie);
      if (user) {
        event.locals.user = user;
      } else {
        event.cookies.delete('auth_session', { path: '/' });
      }
    }
  }

  // Rate limit /api/* (skip /api/v1/health so probes don't get throttled).
  if (isApi && event.url.pathname !== '/api/v1/health') {
    const limit = getNumberSetting('RATE_LIMIT_PER_MINUTE', 60);
    const key = buildLimiterKey(event.locals.user?.id, event.request);
    const result = checkRateLimit(key, limit);
    if (!result.allowed) {
      return json(
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' }
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0'
          }
        }
      );
    }
  }

  return resolve(event);
};
