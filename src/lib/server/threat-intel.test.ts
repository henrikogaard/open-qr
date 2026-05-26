import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/db';
import { setSetting } from './settings';
import { checkThreatIntel } from './threat-intel';

describe('threat intelligence checks', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });

  it('skips external providers when global threat intelligence is disabled', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'false');
    setSetting('ENABLE_WEB_RISK', 'true');
    setSetting('WEB_RISK_API_KEY', 'test-key');
    const fetcher = vi.fn();

    const result = await checkThreatIntel('https://example.com', { fetcher });

    expect(result.blocked).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('blocks when Google Web Risk reports a threat', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_WEB_RISK', 'true');
    setSetting('WEB_RISK_API_KEY', 'test-key');
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ threat: { threatTypes: ['MALWARE'] } })
    });

    const result = await checkThreatIntel('https://bad.example/path', { fetcher });

    expect(result).toEqual({
      blocked: true,
      provider: 'Google Web Risk',
      reason: 'Google Web Risk flagged the URL as MALWARE'
    });
  });

  it('supports multiple enabled providers and blocks on URLhaus malware verdicts', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_WEB_RISK', 'true');
    setSetting('WEB_RISK_API_KEY', 'test-key');
    setSetting('ENABLE_URLHAUS', 'true');

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query_status: 'ok', threat: 'malware_download' })
      });

    const result = await checkThreatIntel('https://bad.example/payload.exe', { fetcher });

    expect(result.blocked).toBe(true);
    expect(result.provider).toBe('URLhaus');
  });

  it('fails open on provider errors by default', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_WEB_RISK', 'true');
    setSetting('WEB_RISK_API_KEY', 'test-key');
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await checkThreatIntel('https://example.com', { fetcher });

    expect(result.blocked).toBe(false);
    expect(result.warnings).toContain('Google Web Risk check failed: timeout');
  });

  it('can fail closed when provider checks error', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_WEB_RISK', 'true');
    setSetting('WEB_RISK_API_KEY', 'test-key');
    setSetting('THREAT_INTEL_FAIL_CLOSED', 'true');
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await checkThreatIntel('https://example.com', { fetcher });

    expect(result).toEqual({
      blocked: true,
      provider: 'Google Web Risk',
      reason: 'Google Web Risk check failed: timeout',
      warnings: ['Google Web Risk check failed: timeout']
    });
  });

  it('checks Spamhaus DBL with host suffixes', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_SPAMHAUS_DBL', 'true');
    const resolve4 = vi.fn(async (hostname: string) => {
      if (hostname === 'example.com.dbl.spamhaus.org') return ['127.0.1.2'];
      throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    });

    const result = await checkThreatIntel('https://login.example.com/path', { resolve4 });

    expect(result.blocked).toBe(true);
    expect(result.provider).toBe('Spamhaus DBL');
    expect(resolve4).toHaveBeenCalledWith('login.example.com.dbl.spamhaus.org');
    expect(resolve4).toHaveBeenCalledWith('example.com.dbl.spamhaus.org');
  });
});
