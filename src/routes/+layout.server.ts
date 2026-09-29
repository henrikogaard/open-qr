import type { LayoutServerLoad } from './$types';
import { db } from '$lib/db';
import { getBooleanSetting, getSetting } from '$lib/server/settings';

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

  const plausibleEnabled = getBooleanSetting('ENABLE_PLAUSIBLE', false);
  const plausibleDomain = getSetting('PLAUSIBLE_DOMAIN', '').trim();

  // Admin-configurable generator defaults (DEFAULT_TEMPLATE /
  // DEFAULT_ERROR_CORRECTION). Sanitized here so a bad admin value can never
  // reach the UI.
  const templates = ['default', 'minimal', 'colorful', 'rounded', 'dark'];
  const ecLevels = ['L', 'M', 'Q', 'H'];
  const defaultTemplate = getSetting('DEFAULT_TEMPLATE', 'default');
  const defaultEc = getSetting('DEFAULT_ERROR_CORRECTION', 'M').toUpperCase();

  return {
    user,
    termsVersion,
    defaults: {
      template: templates.includes(defaultTemplate) ? defaultTemplate : 'default',
      errorCorrection: ecLevels.includes(defaultEc) ? defaultEc : 'M'
    },
    featureFlags: {
      customSlugsEnabled: getBooleanSetting('ENABLE_CUSTOM_SLUGS', false),
      customSlugsAdminOnly: getBooleanSetting('CUSTOM_SLUGS_ADMIN_ONLY', true),
      destinationInterstitial: getBooleanSetting('ENABLE_DESTINATION_INTERSTITIAL', false)
    },
    plausible: {
      enabled: plausibleEnabled && plausibleDomain.length > 0,
      domain: plausibleEnabled ? plausibleDomain : '',
      scriptSrc: plausibleEnabled
        ? getSetting('PLAUSIBLE_SCRIPT_SRC', 'https://plausible.io/js/script.js').trim()
        : ''
    }
  };
};
