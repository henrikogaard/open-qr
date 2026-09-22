import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { sha256Hex } from './sha256';

describe('sha256Hex (browser PoW solver)', () => {
  const cases = [
    '',
    'abc',
    'hello world',
    'a'.repeat(200),
    '3f8a1c2b4d5e' + '123456',
    'héllo — ünïcode ✓',
    'salt' + '0',
    'salt' + '1048575'
  ];

  it.each(cases)('matches node crypto for %j', (input) => {
    const expected = createHash('sha256').update(input).digest('hex');
    expect(sha256Hex(input)).toBe(expected);
  });

  it('matches crypto for every candidate the solver would hash', () => {
    for (let n = 0; n < 500; n++) {
      const message = `abcd1234ef56${n}`;
      expect(sha256Hex(message)).toBe(createHash('sha256').update(message).digest('hex'));
    }
  });
});
