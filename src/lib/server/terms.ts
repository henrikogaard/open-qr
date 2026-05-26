import { getBooleanSetting, getSetting } from './settings';

export interface TermsContext {
  version: string;
  brandName: string;
  operator: string;
  contactEmail: string;
  publicBaseUrl: string;
  plausibleEnabled: boolean;
  plausibleDomain: string;
}

export function getTermsContext(): TermsContext {
  return {
    version: getSetting('TERMS_VERSION', '2026-05-26'),
    brandName: getSetting('BRAND_NAME', 'Open-QR'),
    operator: getSetting('TERMS_OPERATOR', '').trim(),
    contactEmail: getSetting('TERMS_CONTACT_EMAIL', '').trim(),
    publicBaseUrl: getSetting('PUBLIC_BASE_URL', '').trim(),
    plausibleEnabled: getBooleanSetting('ENABLE_PLAUSIBLE', false),
    plausibleDomain: getSetting('PLAUSIBLE_DOMAIN', '').trim()
  };
}

export interface TermsSection {
  heading: string;
  body: string[];
}

/**
 * Renders the Terms-of-Use sections as plain structured data so the page can
 * render them with the design system. Fork operators wanting to add or change
 * clauses edit this file; the version string in settings should be bumped so
 * existing users get re-prompted to accept.
 *
 * Not legal advice. Operators should have these reviewed by a lawyer in
 * their own jurisdiction before going live with significant traffic.
 */
export function getTermsSections(ctx: TermsContext): TermsSection[] {
  const who = ctx.operator || 'the operator of this instance';
  const contact = ctx.contactEmail
    ? `at ${ctx.contactEmail}`
    : 'via the contact channels published by the operator';

  return [
    {
      heading: '1. Scope of this document',
      body: [
        `These Terms govern your use of the hosted ${ctx.brandName} service ("the Service") operated by ${who}. They do not govern the underlying Open-QR software, which is released under the MIT license and may be freely used, modified, and self-hosted by anyone.`,
        'If you self-host your own instance of Open-QR, these Terms do not apply to you or to your users — your instance is governed by whatever terms you choose to publish (or none at all).',
        'Bug reports, security disclosures, and code contributions to the upstream project are governed by the project\'s LICENSE and any CONTRIBUTING file in the repository, not by these Terms. Contributing code does not require assigning copyright; contributors retain ownership under the MIT license.'
      ]
    },
    {
      heading: '2. The Service',
      body: [
        `${ctx.brandName} generates QR codes that redirect through ${who}'s servers to a target URL you supply. The operator records scans so you can see counts, enforces optional expiry and password gates, and surfaces aggregate analytics in the dashboard.`,
        'Depending on the operator\'s configuration, you may be able to use the Service anonymously or only with an account. Anonymous codes have no recovery path — once created, only the operator can identify or remove them.'
      ]
    },
    {
      heading: '3. Who may use it',
      body: [
        'You must be at least the age of digital consent in your jurisdiction to create an account (16 in much of the EU; lower in some member states; 13 in the US). The Service is not intended for younger users and the operator will delete any account known to belong to one.',
        'You confirm that you have the legal capacity to enter into these Terms — for an organisation, that you are authorised to bind it.'
      ]
    },
    {
      heading: '4. Your content remains yours',
      body: [
        'You retain all rights to the URLs you encode and to any content reached through them. The operator does not claim any licence, ownership, or right to re-use the destinations you submit, beyond the technical processing necessary to render the redirect and record the scan.'
      ]
    },
    {
      heading: '5. Acceptable use — what you may NOT encode',
      body: [
        'You agree not to encode targets that link to, host, advertise, or facilitate any of the following:',
        '• Child sexual abuse material (CSAM) or any sexualised content involving minors.',
        '• Malware, exploits, ransomware, droppers, credential stealers, or links into command-and-control infrastructure.',
        '• Phishing, brand impersonation, fake login pages, or any attempt to deceive the scanner about the destination.',
        '• Fraud, scams, fake support lines, romance scams, investment schemes, "pig butchering", or other deception for financial gain.',
        '• Sale or trade of regulated goods without legal authorisation: controlled substances, prescription drugs, firearms, ammunition, explosives, human remains, endangered species.',
        '• Counterfeit goods, pirated software/media, or material that infringes someone else\'s intellectual property.',
        '• Incitement to violence, terrorism, or serious self-harm; threats; doxxing; targeted harassment.',
        '• Non-consensual intimate imagery ("revenge porn") and similar privacy violations.',
        '• Spam, unsolicited bulk advertising, or link laundering for SEO/affiliate fraud.',
        '• Anything else that is unlawful in the jurisdiction of the operator or of the scanner.',
        'Adult content involving consenting adults is not categorically prohibited but may be restricted by the operator on a per-instance basis.'
      ]
    },
    {
      heading: '6. What is collected, and how long it is kept',
      body: [
        'For every scan: a SHA-256 hash of the visitor\'s IP address, a SHA-256 hash of the User-Agent string, a coarse device class (mobile / tablet / desktop / bot), the country code when supplied by the upstream reverse proxy (Cloudflare, Vercel, Fly, Netlify, etc.), and a timestamp. Raw IPs and raw User-Agent strings are never persisted.',
        'For accounts: your email address, OTP login codes (hashed), session identifiers, and any API keys you issue (hashed only).',
        'Retention: scan logs live as long as the QR code they belong to and are deleted when the code is deleted. Sessions auto-expire after 30 days. OTP codes expire after 10 minutes and are single-use. Account data is kept until you request deletion.',
        ctx.plausibleEnabled && ctx.plausibleDomain
          ? `This instance loads Plausible Analytics for ${ctx.plausibleDomain}. Plausible is configured by the operator to measure aggregate page usage and referrers without advertising cookies or cross-site profiling.`
          : 'There are no third-party trackers, pixels, analytics SDKs, or advertising integrations. The Service does not profile users or make automated decisions that produce legal effects about you (GDPR Article 22).',
        `The data controller for this instance is ${who}${ctx.contactEmail ? ` (${ctx.contactEmail})` : ''}. Data is stored on the operator\'s own infrastructure; the operator\'s privacy notice (if separate) discloses the hosting region.`
      ]
    },
    {
      heading: '7. Cookies and local storage',
      body: [
        'The Service uses one functional cookie (`auth_session`) when you log in — it is HttpOnly, SameSite=Strict, and marked Secure when served over HTTPS. There are no advertising or analytics cookies.',
        'Browser localStorage is used to remember your acceptance of these Terms (for anonymous users) and your theme preference. This is strictly necessary for the requested functionality and does not require ePrivacy consent.'
      ]
    },
    {
      heading: '8. Your rights under the GDPR / UK GDPR',
      body: [
        'If you are in the EU, EEA, UK, or another jurisdiction with comparable data-protection law, you have the right to:',
        '• Access your personal data and receive a copy of it.',
        '• Rectify inaccurate personal data.',
        '• Erase your personal data ("right to be forgotten"). Deleting your account triggers this; you can also delete individual QR codes at any time from the dashboard.',
        '• Restrict or object to processing based on legitimate interest (see section 9).',
        '• Receive your data in a portable, machine-readable format. The REST API exposes this.',
        '• Withdraw consent at any time, where processing is based on consent. Withdrawal does not affect lawfulness of processing carried out before withdrawal.',
        '• Lodge a complaint with a supervisory authority — typically the data-protection authority in your country of residence. The operator\'s primary supervisory authority (where applicable) is named in their published privacy notice.',
        'To exercise any of these rights, contact the operator ' + contact + '.'
      ]
    },
    {
      heading: '9. Legal basis (EU / UK users)',
      body: [
        'Account creation, code management, authentication, and API key issuance: necessary for performance of the contract you enter into when you sign up (GDPR Art 6(1)(b)).',
        'Scan analytics (hashed identifiers, country, device class): legitimate interest in operating the Service and providing aggregate analytics to code owners (Art 6(1)(f)). The hash-only design is what keeps this proportionate. You may object to this processing under Article 21; in practice this means asking the operator to delete the QR codes you own, which removes the associated scan logs.',
        'Blocklist enforcement and abuse handling: legitimate interest in not facilitating unlawful activity (Art 6(1)(f)).',
        'Sending OTP login codes by email: performance of the contract (Art 6(1)(b)).'
      ]
    },
    {
      heading: '10. Operator rights and changes',
      body: [
        'The operator may block, disable, or delete any QR code or account that violates these Terms, that is reported as abusive, or that the operator is required to remove by a competent authority.',
        'The operator may share data with law enforcement when legally compelled to do so. Because so little is retained, there is usually nothing of investigative value to share.',
        'The operator may update these Terms. The version string at the top of this page is bumped on material changes. Logged-in users will be prompted to re-accept on their next use; anonymous users will be prompted again the next time they create a code. Continued use after a change constitutes acceptance.'
      ]
    },
    {
      heading: '11. Disclaimer and liability',
      body: [
        'The Service is provided "as is" and "as available", without warranty of any kind, express or implied. You use it at your own risk.',
        'To the maximum extent permitted by law, the operator is not liable for indirect, incidental, consequential, or punitive damages arising from your use of or inability to use the Service. Nothing in these Terms limits or excludes liability that cannot be limited or excluded under applicable law — including any non-waivable rights you have under the GDPR, UK GDPR, or analogous statutes.',
        'You are solely responsible for the destinations you encode and for ensuring you have the right to do so.'
      ]
    },
    {
      heading: '12. Governing law',
      body: [
        'These Terms are governed by the laws of the jurisdiction in which the operator is established, without regard to its conflict-of-laws principles. Mandatory consumer-protection rules in your country of residence still apply.',
        'The open-source software itself is licensed under the MIT license — its use is governed by that license, not by the law of any particular operator\'s jurisdiction.'
      ]
    }
  ];
}
