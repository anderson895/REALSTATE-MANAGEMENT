import { unstable_cache } from 'next/cache';
import { getAdminFirestore, listProjects, type ProjectSummary } from '@sfsr/infrastructure/server';

/**
 * The project list, cached — and only the project list.
 *
 * ── The complaint, and what was actually behind it ───────────────────────
 *
 * Switching project tabs on /inventory took about 1.65 seconds. The obvious
 * explanation was that the page fetches too many units, so the obvious fix was
 * to paginate the query. Both were wrong, and `scripts/measure-inventory-
 * render.ts` is what settled it: `listUnits` with `limit: 1` took 819ms and the
 * same query unlimited took 874ms. A document is nearly free. A round trip is
 * not, and a tab switch makes three:
 *
 *     verifySessionCookie(checkRevoked)   ~290ms
 *     listProjects()                      ~563ms
 *     listUnits()                         ~800ms
 *
 * This removes the middle one on every view but the first in each window.
 * Measured as an A/B — two production builds, same session, clicking through
 * all five project tabs twice — the steady-state page went from **1501ms** to
 * **713ms**.
 *
 * A first attempt at that comparison reported the two as identical, which was
 * the measurement being wrong rather than the change: `git stash push` had
 * silently not applied, so both runs were the cached build being compared with
 * itself. Recorded because "no difference" is exactly the result one is
 * inclined to accept without checking, and here it was an artefact.
 *
 * ── Why the units are NOT cached here ────────────────────────────────────
 *
 * They carry `status`, and status is the thing this screen exists to report.
 * A clerk looking at Unit Inventory to answer "is A-704 still available?"
 * must not be shown a minute-old answer — that is a different class of wrong
 * from a stale figure in a header, and it is the one that ends with two people
 * being told they can have the same unit. The Portal makes the opposite trade
 * deliberately, because a buyer browsing is re-checked inside the reservation
 * transaction anyway. Nobody re-checks a clerk reading a screen.
 *
 * So the units stay uncached and the ~800ms stays with them. This is the half
 * of the saving that costs nothing.
 *
 * ── Why caching the projects is close to free ────────────────────────────
 *
 * `stats` — the counts in the tab strip — is denormalised onto the project
 * document, and the only thing in this app that writes it is
 * `recomputeProjectStats`, called from the inventory actions, which already
 * call `updateTag('projects')` at every site. So the entry is invalidated the
 * moment a unit is added or removed. Confirmed rather than assumed:
 * `updateTag` and `revalidateTag` both funnel into the same `revalidate(tags)`
 * against the incremental cache that `unstable_cache` registers its tags with.
 *
 * The reservation workflow does NOT maintain `stats`, so a unit going On Hold
 * already leaves those counts wrong in Firestore itself — see the note on
 * `countUnitsByProject`. Caching cannot make that worse; it was never fresh.
 *
 * ── Not user-specific, and that is load-bearing ──────────────────────────
 *
 * There is one entry for everybody. That is only safe because the project list
 * is identical for every role — RBAC decides whether you may see this page and
 * which buttons it draws, never which projects are on it. Anything that varies
 * per employee must not be added to this function; it would be served to the
 * next person through the cache.
 */

/**
 * Sixty seconds, where the Portal uses ten minutes.
 *
 * The TTL is not here to save reads — five documents a minute is nothing
 * against the 50,000/day quota. It is here to cover the burst: somebody
 * clicking through five project tabs to find a unit does it inside a few
 * seconds, and that is the whole of the experience being complained about.
 *
 * Short, because the only staleness it can introduce comes from writers
 * outside this process — `scripts/seed/recompute-stats.ts` run from a
 * terminal, or the Portal — which the tag cannot reach. A minute bounds that
 * without anyone noticing.
 */
const PROJECTS_TTL_SECONDS = 60;

/**
 * Bump when a FIELD IS ADDED TO `ProjectSummary`.
 *
 * The cache stores the mapped object, not the Firestore document, so an entry
 * written by an older build keeps that older shape until it expires — the new
 * field is simply absent, and `toSummary`'s fallbacks never run because they
 * already ran, in the previous build. The Portal learned this the expensive
 * way: adding `unitTypeDescriptions` served ten minutes of 500s from entries
 * that predated the field, off a change that typechecked cleanly. TypeScript
 * cannot see across a cache boundary.
 */
const PROJECT_SHAPE_VERSION = 'v2';

export const getCachedProjects = unstable_cache(
  async (): Promise<ProjectSummary[]> => listProjects(getAdminFirestore()),
  ['internal', 'projects', PROJECT_SHAPE_VERSION],
  { revalidate: PROJECTS_TTL_SECONDS, tags: ['projects'] },
);
