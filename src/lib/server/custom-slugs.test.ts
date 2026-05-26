import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { setSetting } from './settings';
import { assertCanUseCustomSlug, normalizeCustomSlug } from './custom-slugs';

describe('custom slugs', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });

  it('normalizes readable slugs', () => {
    expect(normalizeCustomSlug(' Summer_Sale-2026 ')).toBe('summer_sale-2026');
  });

  it('rejects invalid slugs', () => {
    expect(() => normalizeCustomSlug('go/home')).toThrow('Slug may only contain');
    expect(() => normalizeCustomSlug('ab')).toThrow('Slug must be');
  });

  it('requires the feature flag and admin user by default', () => {
    setSetting('ENABLE_CUSTOM_SLUGS', 'true');
    setSetting('CUSTOM_SLUGS_ADMIN_ONLY', 'true');

    expect(() => assertCanUseCustomSlug('summer-sale', { id: 1, email: 'u@test', isAdmin: false })).toThrow(
      'Custom slugs are limited to admins'
    );
    expect(assertCanUseCustomSlug('summer-sale', { id: 1, email: 'a@test', isAdmin: true })).toBe(
      'summer-sale'
    );
  });
});
