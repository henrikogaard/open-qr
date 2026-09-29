import { describe, it, expect } from 'vitest';
import { appendUtmParams, hasUtmParams, EMPTY_UTM } from './utm';

describe('utm', () => {
  it('appends provided params and preserves existing query', () => {
    const out = appendUtmParams('https://example.com/path?a=1', { source: 'poster', medium: 'qr' });
    expect(out).toBe('https://example.com/path?a=1&utm_source=poster&utm_medium=qr');
  });

  it('overwrites existing utm params instead of duplicating', () => {
    const out = appendUtmParams('https://example.com/?utm_source=old', { source: 'new' });
    expect(out).toBe('https://example.com/?utm_source=new');
  });

  it('trims values and skips empty ones', () => {
    const out = appendUtmParams('https://example.com', { source: '  x  ', medium: '', campaign: undefined });
    expect(out).toBe('https://example.com/?utm_source=x');
  });

  it('leaves the URL untouched with no params set', () => {
    expect(appendUtmParams('https://example.com', EMPTY_UTM)).toBe('https://example.com');
    expect(appendUtmParams('https://example.com', {})).toBe('https://example.com');
  });

  it('refuses to tag non-http(s) URLs', () => {
    expect(appendUtmParams('mailto:a@b.com?x=1', { source: 's' })).toBe('mailto:a@b.com?x=1');
    expect(appendUtmParams('tel:+1234', { source: 's' })).toBe('tel:+1234');
  });

  it('returns unparseable input unchanged', () => {
    expect(appendUtmParams('not a url', { source: 's' })).toBe('not a url');
  });

  it('hasUtmParams detects any non-blank value', () => {
    expect(hasUtmParams({ source: 'x' })).toBe(true);
    expect(hasUtmParams({ source: '  ' })).toBe(false);
    expect(hasUtmParams(EMPTY_UTM)).toBe(false);
  });
});
