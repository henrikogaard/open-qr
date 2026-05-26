import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/db';
import { setSetting } from './settings';
import { assertSafeTargetUrl } from './url-safety';

describe('URL safety gate', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM blacklist').run();
  });

  it('rejects threat intelligence provider matches', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_URLHAUS', 'true');
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query_status: 'ok', threat: 'malware_download' })
    });

    await expect(
      assertSafeTargetUrl('https://malware.example/file.exe', { fetcher })
    ).rejects.toThrow('URL blocked: URLhaus flagged the URL as malware_download');
  });

  it('still rejects unsupported schemes before external checks', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_URLHAUS', 'true');
    const fetcher = vi.fn();

    await expect(assertSafeTargetUrl('javascript:alert(1)', { fetcher })).rejects.toThrow(
      'Scheme "javascript:" is not allowed'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('can skip external checks while keeping local validation', async () => {
    setSetting('ENABLE_THREAT_INTEL', 'true');
    setSetting('ENABLE_URLHAUS', 'true');
    const fetcher = vi.fn();

    await expect(
      assertSafeTargetUrl('https://example.com/live-preview', { fetcher, threatIntel: false })
    ).resolves.toBeUndefined();

    expect(fetcher).not.toHaveBeenCalled();
  });
});
