import type { PageServerLoad } from './$types';
import { getTermsContext, getTermsSections } from '$lib/server/terms';

export const load: PageServerLoad = async () => {
  const ctx = getTermsContext();
  return {
    terms: {
      ...ctx,
      sections: getTermsSections(ctx)
    }
  };
};
