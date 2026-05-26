import { describe, it, expect, beforeEach } from 'vitest';
import { getSetting, setSetting, getBooleanSetting } from './settings';
import { buildShortUrl } from './urls';
import { db } from '$lib/db';

describe('settings', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });
  
  it('should return default value for missing setting', () => {
    expect(getSetting('missing', 'default')).toBe('default');
  });
  
  it('should set and get a setting', () => {
    setSetting('test_key', 'test_value');
    expect(getSetting('test_key')).toBe('test_value');
  });
  
  it('should handle boolean settings', () => {
    setSetting('bool_test', 'true');
    expect(getBooleanSetting('bool_test')).toBe(true);
    setSetting('bool_test', 'false');
    expect(getBooleanSetting('bool_test')).toBe(false);
  });

  it('should build short URLs from configured public base URL', () => {
    setSetting('PUBLIC_BASE_URL', 'https://qr.example.com/path/');

    expect(buildShortUrl('abc123', 'http://localhost:3000')).toBe('https://qr.example.com/path/go/abc123');
  });
});
