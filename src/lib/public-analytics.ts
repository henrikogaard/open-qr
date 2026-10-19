type State = {
  enabled: boolean; domain: string; scriptSrc: string; url: URL;
  authenticated: boolean; dnt: string | null; gpc: boolean;
};

// No persistent tracker: only these public routes may produce a pageview.
export function publicPageview(state: State) {
  if (!state.enabled || state.authenticated || state.gpc || state.dnt === '1' || state.dnt === 'yes') return null;
  if (state.url.protocol !== 'https:' || state.url.hostname !== state.domain) return null;
  if (!['/', '/terms'].includes(state.url.pathname)) return null;
  try {
    const collector = new URL(state.scriptSrc);
    if (collector.protocol !== 'https:' || collector.username || collector.password) return null;
    return {
      endpoint: collector.origin + '/api/event',
      body: { name: 'pageview', domain: state.domain, url: state.url.origin + state.url.pathname, referrer: '' }
    };
  } catch { return null; }
}
