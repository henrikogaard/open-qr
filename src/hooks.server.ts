import { json, type Handle } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { getUserBySession } from '$lib/server/auth';
import { extractApiKey, getUserByApiKey } from '$lib/server/api-keys';
import { runMigrations } from '$lib/db/schema';
import { getBooleanSetting, getNumberSetting, getSetting, initDefaultSettings } from '$lib/server/settings';
import { buildLimiterKey, checkRateLimit } from '$lib/server/rate-limit';
import { runCleanup } from '$lib/server/cleanup';
import { maybeSendWeeklyDigests } from '$lib/server/digest';

// Run migrations and init settings on startup
runMigrations();
initDefaultSettings();

// Housekeeping at boot and daily thereafter. Skipped under vitest (modules
// are imported by tests) and unref'd so it never holds the process open.
if (!process.env.VITEST) {
  const housekeeping = () => {
    runCleanup();
    // No-op unless ENABLE_WEEKLY_DIGEST is on; a mail failure must never
    // break the cleanup sweep.
    void maybeSendWeeklyDigests().catch((err) => {
      console.error('[digest] weekly run failed:', err);
    });
  };
  housekeeping();
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const cleanupTimer = setInterval(housekeeping, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

/**
 * Baseline security headers for every response. Scripts are allowed via a
 * per-request nonce (applied to every <script> in rendered pages, including
 * SvelteKit's inline bootstrap, whose content is build-specific) plus the
 * hash-pinned theme boot script in app.html. When Plausible is enabled its
 * origin joins script-src/connect-src. Styles allow inline because the UI
 * uses inline style attributes for bars/widths; images allow data: for
 * rendered QR previews. API JSON responses carry the headers too — harmless
 * there, and the SVG image endpoint is same-origin content worth covering.
 */
function securityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-frqyjPWhIXir+MfBr6EbtUOUK3064INJ4PP3YzvEh8E='`,
    "style-src 'self' 'unsafe-inline' https://rsms.me https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://rsms.me",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Deliberately broad: a form POST to a gated /go/<code> ends in a 302 to
    // the (cross-origin) destination, and form-action governs every hop of a
    // form submission — 'self' would break the redirector's core flow. The
    // scheme restriction still blocks data:/javascript: exfiltration.
    "form-action 'self' http: https:",
    "frame-ancestors 'none'"
  ];

  if (getBooleanSetting('ENABLE_PLAUSIBLE', false)) {
    const src = getSetting('PLAUSIBLE_SCRIPT_SRC', 'https://plausible.io/js/script.js').trim();
    try {
      const origin = new URL(src).origin;
      csp[1] += ` ${origin}`;
      csp[5] = `connect-src 'self' ${origin}`;
    } catch {
      /* a bad admin value degrades to the default policy */
    }
  }

  return {
    'Content-Security-Policy': csp.join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Ignored by browsers on plain-HTTP responses, so safe for bare-HTTP
    // self-hosting while still protecting HTTPS deployments.
    'Strict-Transport-Security': 'max-age=31536000'
  };
}

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
    const key = buildLimiterKey(event.locals.user?.id, event.request, event.getClientAddress);
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

  // Per-request CSP nonce: applied to every <script> in rendered pages so
  // SvelteKit's build-specific inline bootstrap is allowed without widening
  // script-src beyond 'self' + nonce.
  const nonce = randomBytes(16).toString('base64');
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace(/<script/g, `<script nonce="${nonce}"`)
  });
  for (const [key, value] of Object.entries(securityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  return response;
};
