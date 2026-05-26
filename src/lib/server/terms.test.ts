import { describe, expect, it } from 'vitest';
import { getTermsSections, type TermsContext } from './terms';

function context(overrides: Partial<TermsContext> = {}): TermsContext {
  return {
    version: '2026-05-26',
    brandName: 'Open-QR',
    operator: 'Example AS',
    contactEmail: 'privacy@example.com',
    publicBaseUrl: 'https://qr.example.com',
    plausibleEnabled: false,
    plausibleDomain: '',
    ...overrides
  };
}

describe('terms privacy text', () => {
  it('discloses Plausible when the integration is enabled', () => {
    const sections = getTermsSections(
      context({ plausibleEnabled: true, plausibleDomain: 'qr.example.com' })
    );

    const dataCollection = sections.find((section) => section.heading.includes('What is collected'));

    expect(dataCollection?.body.join('\n')).toContain('Plausible');
    expect(dataCollection?.body.join('\n')).toContain('qr.example.com');
  });
});
