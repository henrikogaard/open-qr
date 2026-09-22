import { afterEach, describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { _resetCaptcha, issueCaptchaChallenge, verifyCaptchaSolution } from './captcha';
import { getSetting } from './settings';

function solve(salt: string, challenge: string, max: number): number {
  for (let n = 0; n < max; n++) {
    if (createHash('sha256').update(salt + n).digest('hex') === challenge) return n;
  }
  throw new Error('unsolvable challenge');
}

afterEach(() => _resetCaptcha());

describe('captcha', () => {
  it('accepts a correct proof of work', () => {
    const { payload, salt, challenge, maxnumber } = issueCaptchaChallenge();
    const number = solve(salt, challenge, maxnumber);
    expect(number).toBeLessThan(maxnumber);
    expect(verifyCaptchaSolution(payload, number)).toBe(true);
  });

  it('rejects a wrong solution', () => {
    const { payload } = issueCaptchaChallenge();
    expect(verifyCaptchaSolution(payload, 987654321)).toBe(false);
  });

  it('rejects garbage payloads and solutions', () => {
    expect(verifyCaptchaSolution(null, 1)).toBe(false);
    expect(verifyCaptchaSolution('not-base64-json!!', 1)).toBe(false);
    expect(verifyCaptchaSolution(Buffer.from('[]').toString('base64'), 1)).toBe(false);
    const { payload } = issueCaptchaChallenge();
    expect(verifyCaptchaSolution(payload, 1.5)).toBe(false);
    expect(verifyCaptchaSolution(payload, -1)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const { payload, salt, challenge, maxnumber } = issueCaptchaChallenge();
    const number = solve(salt, challenge, maxnumber);

    const parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    parsed.signature = '0'.repeat(64);
    const tampered = Buffer.from(JSON.stringify(parsed)).toString('base64');

    expect(verifyCaptchaSolution(tampered, number)).toBe(false);
  });

  it('rejects an expired challenge even when correctly signed', () => {
    const secret = getSetting('CAPTCHA_SECRET', '');
    const salt = 'deadbeef';
    const challenge = createHash('sha256').update(salt + '42').digest('hex');
    const expiresAt = Date.now() - 1000;
    const signature = createHmac('sha256', secret).update(`${salt}:${challenge}:${expiresAt}`).digest('hex');
    const payload = Buffer.from(
      JSON.stringify({ algorithm: 'SHA-256', challenge, salt, expiresAt, signature })
    ).toString('base64');

    expect(verifyCaptchaSolution(payload, 42)).toBe(false);
  });

  it('rejects a forged challenge signed with the wrong key', () => {
    const salt = 'cafebabe';
    const challenge = createHash('sha256').update(salt + '7').digest('hex');
    const expiresAt = Date.now() + 60_000;
    const signature = createHmac('sha256', 'attacker-key').update(`${salt}:${challenge}:${expiresAt}`).digest('hex');
    const payload = Buffer.from(
      JSON.stringify({ algorithm: 'SHA-256', challenge, salt, expiresAt, signature })
    ).toString('base64');

    expect(verifyCaptchaSolution(payload, 7)).toBe(false);
  });

  it('allows each challenge only once', () => {
    const { payload, salt, challenge, maxnumber } = issueCaptchaChallenge();
    const number = solve(salt, challenge, maxnumber);

    expect(verifyCaptchaSolution(payload, number)).toBe(true);
    expect(verifyCaptchaSolution(payload, number)).toBe(false);
  });
});
