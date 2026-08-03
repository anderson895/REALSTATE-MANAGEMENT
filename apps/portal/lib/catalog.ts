import { unstable_cache } from 'next/cache';
import {
  getAdminFirestore,
  getProject,
  getUnit,
  listProjects,
  listUnits,
  type ProjectSummary,
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

/**
 * Ten minutes, not one.
 *
 * The TTL is a direct multiplier on the daily read bill: at 60s a page that is
 * being browsed continuously refills its cache 1,440 times a day, at 600s it
 * refills 144. On the Spark plan's 50,000 reads/day that is the difference
 * between comfortable and capped.
 *
 * What it costs is freshness on the BROWSE pages — a unit reserved in the last
 * ten minutes can still show as Available in a listing. That is safe because
 * the listing is not what protects inventory: `createReservation` re-reads the
 * unit UNCACHED inside a transaction, so a buyer who clicks through to a unit
 * someone else just took is refused there. Stale browse data costs one wasted
 * click; it cannot cause a double sale.
 */
const BROWSE_TTL_SECONDS = 600;

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
 * EVERY unit in a project — one cache entry per project, no filter in the key.
 *
 * This used to push the filters down into the Firestore query, which read
 * fewer documents per call and looked like the cheaper option. Over a browsing
 * session it was the more expensive one, because the filters were also part of
 * the CACHE KEY: every combination of tower × type × status became its own
 * entry with its own expiry. A visitor toggling four filters paid four cold
 * reads and left four entries to refill independently, and the cross-project
 * search page added ~30 more that shared nothing with the project pages.
 *
 * Fetching the whole project once inverts that. A project holds at most 30
 * units, so the cold read is 30 documents and EVERY filter combination on
 * every page is then served from that one entry, in memory, for free.
 *
 * Unit browsing across the whole portal is therefore bounded at
 * 5 projects × 30 units = 150 documents per TTL window, whatever anyone
 * filters by (Development Plan.md §12.30 — this supersedes the push-down
 * described there).
 */
export const getCachedUnits = unstable_cache(
  async (projectId: string): Promise<UnitRow[]> => listUnits(getAdminFirestore(), projectId),
  ['catalog', 'units'],
  { revalidate: BROWSE_TTL_SECONDS, tags: ['units'] },
);

export interface UnitQuery {
  readonly tower?: string;
  readonly unitType?: string;
  readonly status?: string;
  /** Inclusive bounds, in centavos. */
  readonly minCentavos?: number | null;
  readonly maxCentavos?: number | null;
}

/**
 * The filtering that used to happen in Firestore, now in memory.
 *
 * Shared by the project page and the cross-project search so the two cannot
 * disagree about what "Studio, under ₱7M" means — the bug that a second
 * hand-written filter would eventually introduce.
 */
export function filterUnits(units: readonly UnitRow[], q: UnitQuery): UnitRow[] {
  return units.filter(
    (u) =>
      (!q.tower || u.tower === q.tower) &&
      (!q.unitType || u.unitType === q.unitType) &&
      (!q.status || u.status === q.status) &&
      (q.minCentavos == null || u.purchasePriceCentavos >= q.minCentavos) &&
      (q.maxCentavos == null || u.purchasePriceCentavos <= q.maxCentavos),
  );
}

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
