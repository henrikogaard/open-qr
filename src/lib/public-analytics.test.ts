import { describe, expect, it } from 'vitest';
import { publicPageview } from './public-analytics';

const state = { enabled: true, domain: 'openqr.xyz', scriptSrc: 'https://analytics.ogard.cloud/js/script.js', url: new URL('https://openqr.xyz/?secret=test#private'), authenticated: false, dnt: null, gpc: false };
describe('public analytics boundary', () => {
  it('sends only a canonical public URL', () => {
    expect(publicPageview(state)).toEqual({ endpoint: 'https://analytics.ogard.cloud/api/event', body: { name: 'pageview', domain: 'openqr.xyz', url: 'https://openqr.xyz/', referrer: '' } });
    expect(publicPageview({ ...state, url: new URL('https://openqr.xyz/terms?email=private') })?.body.url).toBe('https://openqr.xyz/terms');
  });
  it('excludes authenticated users, private routes and privacy opt-outs', () => {
    for (const path of ['/login', '/verify-otp', '/dashboard', '/go/private', '/report/private', '/status', '/admin', '/terms/private']) {
      expect(publicPageview({ ...state, url: new URL('https://openqr.xyz' + path) })).toBeNull();
    }
    for (const extra of [{ authenticated: true }, { enabled: false }, { dnt: '1' }, { dnt: 'yes' }, { gpc: true }, { domain: '' }, { scriptSrc: 'invalid' }, { scriptSrc: 'http://analytics.example/js/script.js' }, { url: new URL('https://staging.openqr.xyz/') }]) {
      expect(publicPageview({ ...state, ...extra })).toBeNull();
    }
  });
});
