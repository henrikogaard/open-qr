/**
 * Resolve the best available client IP for rate limiting and abuse controls.
 *
 * SvelteKit's getClientAddress() returns the socket peer — behind a
 * TLS-terminating proxy (the standard deployment) that's the proxy itself,
 * so every visitor would share one rate-limit bucket and the 3-per-10-min
 * OTP send cap would lock out all logins site-wide. Proxy headers fix that
 * at the cost of being spoofable when the origin is reachable directly.
 *
 * Priority: CF-Connecting-IP (set by Cloudflare from its own observed peer,
 * not client-controllable when traffic actually goes through Cloudflare),
 * then the leftmost X-Forwarded-For entry (status-quo behavior; spoofable),
 * then the socket address.
 *
 * Operators should firewall the origin to the proxy's IP ranges — then the
 * headers can't be forged. See README "Deployment".
 */

export function resolveClientIp(request: Request, getClientAddress: () => string): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf?.trim()) return cf.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;

  try {
    return getClientAddress();
  } catch {
    // getClientAddress throws when ADDRESS_HEADER is configured but absent
    // on the request (e.g. health probes from some proxies).
    return 'unknown';
  }
}
