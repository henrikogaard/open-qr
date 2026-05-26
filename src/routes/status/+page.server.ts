import type { PageServerLoad } from './$types';
import { getOperationalStatus } from '$lib/server/status';

export const load: PageServerLoad = async () => {
  return { status: getOperationalStatus() };
};
