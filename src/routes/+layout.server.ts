import type { LayoutServerLoad } from './$types';
import { db } from '$lib/db';
import { getSetting } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals }) => {
  const termsVersion = getSetting('TERMS_VERSION', '2026-05-26');

  let user = locals.user;
  if (user) {
    const row = db
      .prepare('SELECT terms_accepted_version FROM users WHERE id = ?')
      .get(user.id) as { terms_accepted_version: string | null } | undefined;
    user = { ...user, termsAcceptedVersion: row?.terms_accepted_version ?? null } as typeof user & {
      termsAcceptedVersion: string | null;
    };
  }

  return { user, termsVersion };
};
