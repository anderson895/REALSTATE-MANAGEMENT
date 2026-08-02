import { unstable_cache } from 'next/cache';
import {
  countUnitsByStatus,
  getAdminFirestore,
  listProjects,
  type ProjectSummary,
} from '@sfsr/infrastructure/server';

/**
 * Cached inventory reads for the Internal system.
 *
 * Every internal page reads the session cookie, so all of them render
 * dynamically and a page-level `revalidate` never fires. Caching therefore has
 * to happen here, around the data (Development Plan.md §12.30).
 *
 * The window is shorter than the Portal's: staff act on these numbers, so
 * 15 seconds of staleness is the most that is comfortable. The authoritative
 * status is always re-read from the unit document inside the reservation
 * transaction, which is what actually prevents a double sale — these figures
 * are for orientation, not for decisions.
 */

const DASHBOARD_TTL_SECONDS = 15;

export const getCachedProjects = unstable_cache(
  async (): Promise<ProjectSummary[]> => listProjects(getAdminFirestore()),
  ['internal', 'projects'],
  { revalidate: DASHBOARD_TTL_SECONDS, tags: ['projects'] },
);

export const getCachedUnitCounts = unstable_cache(
  async (): Promise<Record<string, number>> => countUnitsByStatus(getAdminFirestore()),
  ['internal', 'unit-counts'],
  { revalidate: DASHBOARD_TTL_SECONDS, tags: ['units'] },
);
