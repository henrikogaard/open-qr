import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { issuePwGate, pwCookieName, verifyPwGate } from './pw-gate';
import { setSetting } from './settings';
import { randomBytes } from 'crypto';

describe('pw-gate', () => {
  beforeEach(() => {
    setSetting('CAPTCHA_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the cookie per short code', () => {
    expect(pwCookieName('abc12345')).toBe('openqr_pw_abc12345');
  });

  it('round-trips a freshly issued gate', () => {
    const gate = issuePwGate('abc12345');
    expect(verifyPwGate('abc12345', gate.value)).toBe(true);
  });

  it('rejects gates for a different short code', () => {
    const gate = issuePwGate('abc12345');
    expect(verifyPwGate('othercode', gate.value)).toBe(false);
  });

  it('rejects tampered tokens, garbage, and absence', () => {
    const gate = issuePwGate('abc12345');
    const [exp, sig] = gate.value.split('.');
    expect(verifyPwGate('abc12345', `${exp}.${'0'.repeat(sig.length)}`)).toBe(false);
    expect(verifyPwGate('abc12345', 'garbage')).toBe(false);
    expect(verifyPwGate('abc12345', undefined)).toBe(false);
  });

  it('rejects expired gates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const gate = issuePwGate('abc12345');

    vi.setSystemTime(new Date('2030-01-01T00:11:00Z')); // 11 minutes later
    expect(verifyPwGate('abc12345', gate.value)).toBe(false);
  });

  it('signatures are bound to the install secret', () => {
    const gate = issuePwGate('abc12345');
    setSetting('CAPTCHA_SECRET', randomBytes(16).toString('hex'));
    expect(verifyPwGate('abc12345', gate.value)).toBe(false);
  });
});
