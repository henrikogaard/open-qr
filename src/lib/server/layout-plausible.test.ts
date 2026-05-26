import { beforeEach, describe, expect, it } from 'vitest';
import { load } from '../../routes/+layout.server';
import { db } from '$lib/db';
import { setSetting } from './settings';

describe('root layout Plausible settings', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });

  it('exposes Plausible config only when enabled with a domain', async () => {
    setSetting('ENABLE_PLAUSIBLE', 'true');
    setSetting('PLAUSIBLE_DOMAIN', 'qr.example.com');
    setSetting('PLAUSIBLE_SCRIPT_SRC', 'https://plausible.example.com/js/script.js');

    const data = (await load({ locals: {} } as any)) as any;

    expect(data.plausible).toEqual({
      enabled: true,
      domain: 'qr.example.com',
      scriptSrc: 'https://plausible.example.com/js/script.js'
    });
  });

  it('does not expose Plausible script data when disabled', async () => {
    setSetting('ENABLE_PLAUSIBLE', 'false');
    setSetting('PLAUSIBLE_DOMAIN', 'qr.example.com');

    const data = (await load({ locals: {} } as any)) as any;

    expect(data.plausible.enabled).toBe(false);
    expect(data.plausible.domain).toBe('');
  });
});
