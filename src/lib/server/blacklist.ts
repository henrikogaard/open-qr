import { db } from '$lib/db';
import { getBooleanSetting } from './settings';
import { isIP } from 'node:net';

/**
 * URI schemes we let users encode into a QR code. Restricting to this set
 * blocks `javascript:` / `file:` / `data:` payloads that could be used to
 * trick users with malicious QRs. `mailto`/`tel`/`sms` are common
 * QR use cases (vCards, contact cards, click-to-call posters).
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:']);

export function isAllowedScheme(url: string): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(url.trim());
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
      return {
        allowed: false,
        reason: `Scheme "${parsed.protocol}" is not allowed. Use http, https, mailto, tel, or sms.`
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Target URL is not a valid URL' };
  }
}

export function isBlacklisted(url: string): { blocked: boolean; reason?: string } {
  if (!getBooleanSetting('ENABLE_BLACKLIST', true)) {
    return { blocked: false };
  }
  
  try {
    const parsed = new URL(url);
    
    const patterns = db.prepare(
      'SELECT pattern, is_regex FROM blacklist WHERE is_active = 1'
    ).all() as { pattern: string; is_regex: number }[];
    
    for (const { pattern, is_regex } of patterns) {
      if (is_regex) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(url)) {
            return { blocked: true, reason: `Matches blacklist pattern: ${pattern}` };
          }
        } catch {
          continue;
        }
      } else if (pattern.includes('*')) {
        const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(regexPattern, 'i');
        if (regex.test(url)) {
          return { blocked: true, reason: `Matches blacklist pattern: ${pattern}` };
        }
      } else {
        if (url.toLowerCase().includes(pattern.toLowerCase())) {
          return { blocked: true, reason: `Matches blacklist pattern: ${pattern}` };
        }
      }
    }
    
    if (getBooleanSetting('ENABLE_SUSPICIOUS_BLOCK', true)) {
      const suspicious = checkSuspicious(url, parsed);
      if (suspicious.blocked) {
        return suspicious;
      }
    }
    
    return { blocked: false };
  } catch {
    return { blocked: true, reason: 'Invalid URL format' };
  }
}

function checkSuspicious(url: string, parsed: URL): { blocked: boolean; reason?: string } {
  const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'short.link'];
  if (shorteners.some(s => parsed.hostname.toLowerCase().includes(s))) {
    return { blocked: true, reason: 'URL shorteners are not allowed' };
  }
  
  if (isIP(parsed.hostname) !== 0) {
    return { blocked: true, reason: 'IP-based URLs are not allowed' };
  }
  
  const subdomainCount = parsed.hostname.split('.').length;
  if (subdomainCount > 4) {
    return { blocked: true, reason: 'Excessive subdomains detected' };
  }
  
  const phishingKeywords = ['login', 'verify', 'account', 'secure', 'update', 'confirm', 'banking'];
  const pathLower = parsed.pathname.toLowerCase();
  if (phishingKeywords.some(k => pathLower.includes(k)) && !parsed.protocol.includes('https')) {
    return { blocked: true, reason: 'Suspicious non-HTTPS URL detected' };
  }

  // Scheme allow-list lives in isAllowedScheme(); no need to re-enforce here.

  return { blocked: false };
}

export function addToBlacklist(pattern: string, isRegex: boolean = false): void {
  db.prepare('INSERT INTO blacklist (pattern, is_regex) VALUES (?, ?)').run(pattern, isRegex ? 1 : 0);
}

export function removeFromBlacklist(id: number): void {
  db.prepare('DELETE FROM blacklist WHERE id = ?').run(id);
}

export function getBlacklist(): { id: number; pattern: string; is_regex: number; is_active: number; created_at: string }[] {
  return db.prepare('SELECT * FROM blacklist ORDER BY created_at DESC').all() as any;
}
