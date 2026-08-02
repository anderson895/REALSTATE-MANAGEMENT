import { unstable_cache } from 'next/cache';
import {
  getAdminFirestore,
  getProject,
  getUnit,
  listProjects,
  listUnits,
  type ProjectSummary,
  type UnitFilters,
  type UnitRow,
} from '@sfsr/infrastructure/server';

/**
 * Cached catalogue reads.
 *
 * ── Why the page-level `revalidate` was not enough ────────────────────────
 *
 * The portal shell reads `cookies()` (for the client tier) and `headers()`
 * (for the sidebar's active item). Both are dynamic APIs, so every page under
 * the shell renders on demand and `export const revalidate` never takes
 * effect — the build output marks them all `ƒ`.
 *
 * `unstable_cache` caches the DATA rather than the rendered page, so it works
 * even under dynamic rendering. A burst of visitors hitting the landing page
 * shares one Firestore read set per window instead of paying 5 reads each.
 *
 * Sustained browsing therefore costs a bounded ~7,200 reads/day against the
 * 50,000/day Spark quota, no matter how much traffic arrives
 * (Development Plan.md §12.30).
 *
 * Cache tags let a reservation invalidate the affected project immediately
 * via `revalidateTag`, so an availability change is not stuck behind the TTL.
 */

const BROWSE_TTL_SECONDS = 60;

export const getCachedProjects = unstable_cache(
  async (): Promise<ProjectSummary[]> => listProjects(getAdminFirestore()),
  ['catalog', 'projects'],
  { revalidate: BROWSE_TTL_SECONDS, tags: ['projects'] },
);

export const getCachedProject = unstable_cache(
  async (projectId: string): Promise<ProjectSummary | null> =>
    getProject(getAdminFirestore(), projectId),
  ['catalog', 'project'],
  { revalidate: BROWSE_TTL_SECONDS, tags: ['projects'] },
);

/**
 * Units for a project, cached per filter combination.
 *
 * The filters are part of the cache key, so `?type=Studio` and the unfiltered
 * view are cached separately — a visitor toggling filters does not thrash a
 * single entry.
 */
export const getCachedUnits = unstable_cache(
  async (projectId: string, filters: UnitFilters): Promise<UnitRow[]> =>
    listUnits(getAdminFirestore(), projectId, filters),
  ['catalog', 'units'],
  { revalidate: BROWSE_TTL_SECONDS, tags: ['units'] },
);

/**
 * A single unit.
 *
 * Shorter TTL than the browse lists: this is the page a buyer is looking at
 * when they decide to reserve, so a stale "Available" here is the most
 * misleading. The reservation transaction re-reads the unit uncached anyway —
 * that is what actually prevents a double sale — but the page should not
 * invite someone into a flow that is about to reject them.
 */
export const getCachedUnit = unstable_cache(
  async (unitId: string): Promise<UnitRow | null> => getUnit(getAdminFirestore(), unitId),
  ['catalog', 'unit'],
  { revalidate: 15, tags: ['units'] },
);
