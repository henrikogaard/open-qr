import { describe, it, expect, beforeEach } from 'vitest';
import { isBlacklisted, addToBlacklist } from './blacklist';
import { db } from '$lib/db';

describe('blacklist', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM blacklist').run();
  });
  
  it('should allow valid URLs', () => {
    const result = isBlacklisted('https://example.com/page');
    expect(result.blocked).toBe(false);
  });
  
  it('should block blacklisted domains', () => {
    addToBlacklist('evil.com');
    const result = isBlacklisted('https://evil.com/phishing');
    expect(result.blocked).toBe(true);
  });
  
  it('should block URL shorteners', () => {
    const result = isBlacklisted('https://bit.ly/abc123');
    expect(result.blocked).toBe(true);
  });
  
  it('should block IP-based URLs', () => {
    const result = isBlacklisted('http://192.168.1.1/login');
    expect(result.blocked).toBe(true);
  });
  
  it('should support wildcard patterns', () => {
    addToBlacklist('*.malicious.com');
    const result = isBlacklisted('https://sub.malicious.com/page');
    expect(result.blocked).toBe(true);
  });
});
