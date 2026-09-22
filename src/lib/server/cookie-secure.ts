import type { IncomingMessage } from 'node:http';

/**
 * Whether cookies may carry the Secure flag.
 *
 * adapter-node defaults event.url.protocol to `https` when PROTOCOL_HEADER
 * is unset — a security-flavored guess that breaks bare-HTTP self-hosted
 * deployments (browsers silently drop Secure cookies over http, so login
 * appears to succeed but never persists). Instead of trusting the guess:
 *
 *  - a direct TLS connection to this Node process (socket.encrypted) is a
 *    fact → Secure;
 *  - a configured PROTOCOL_HEADER vouching `https` is a fact → Secure;
 *  - anything else (plain HTTP, adapter guessing) → no Secure flag. Browsers
 *    happily accept non-Secure cookies over HTTPS, so a proxy operator who
 *    skips PROTOCOL_HEADER loses only the flag, never their login.
 */

export interface PlatformWithReq {
  req?: IncomingMessage;
}

export function shouldSecureCookie(url: URL, platform?: PlatformWithReq): boolean {
  if ((platform?.req?.socket as { encrypted?: boolean } | undefined)?.encrypted) return true;
  if (process.env.PROTOCOL_HEADER && url.protocol === 'https:') return true;
  return false;
}
