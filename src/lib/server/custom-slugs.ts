import { getBooleanSetting } from './settings';

export interface SlugUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'dashboard',
  'go',
  'login',
  'report',
  'status',
  'terms',
  'verify-otp'
]);

export function normalizeCustomSlug(input: string): string {
  const slug = input.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 64) {
    throw new Error('Slug must be between 3 and 64 characters');
  }
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(slug)) {
    throw new Error('Slug may only contain letters, numbers, hyphens and underscores');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error('Slug is reserved');
  }
  return slug;
}

export function assertCanUseCustomSlug(input: string, user: SlugUser | null | undefined): string {
  if (!getBooleanSetting('ENABLE_CUSTOM_SLUGS', false)) {
    throw new Error('Custom slugs are disabled');
  }
  if (getBooleanSetting('CUSTOM_SLUGS_ADMIN_ONLY', true) && !user?.isAdmin) {
    throw new Error('Custom slugs are limited to admins');
  }
  return normalizeCustomSlug(input);
}
