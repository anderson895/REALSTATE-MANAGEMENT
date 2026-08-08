import { FieldPath, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { ProjectStats } from './catalog.queries';

/**
 * Write side of the catalogue — adding projects and units.
 *
 * The read side next door exists to keep page views cheap. This exists to keep
 * the numbers it reads TRUE: every write here is followed by a recompute of the
 * project's denormalised `stats`, because a unit added without one is a unit
 * the landing page will not count and the browse pages will not show.
 */

/**
 * The stat definition, in one place.
 *
 * Pure, and separated from the fetching for a reason: two callers need these
 * numbers with completely different read budgets. `scripts/seed/recompute-stats.ts`
 * scans every collection ONCE and computes all five projects from the result,
 * which is right for a bulk run. `recomputeProjectStats` below reads a single
 * project's documents, which is right after one unit is added. Two fetch
 * strategies, one definition — a second copy of this arithmetic is how the
 * landing page and the seed end up disagreeing about how many units are free.
 */
export function computeProjectStats(
  units: readonly DocumentData[],
  parking: readonly DocumentData[],
): ProjectStats {
  const prices = units.map((u) => Number(u.purchasePriceCentavos ?? 0)).filter((n) => n > 0);

  return {
    totalUnits: units.length,
    availableUnits: units.filter((u) => u.status === 'Available').length,
    onHoldUnits: units.filter((u) => u.status === 'On Hold').length,
    soldUnits: units.filter((u) => u.status === 'Sold').length,
    totalParking: parking.length,
    availableParking: parking.filter((p) => p.status === 'Available').length,
    minPriceCentavos: prices.length ? Math.min(...prices) : null,
    maxPriceCentavos: prices.length ? Math.max(...prices) : null,
    unitTypes: [...new Set(units.map((u) => String(u.unitType)))].sort(),
  };
}

/**
 * Recompute and store one project's counts.
 *
 * COST: however many units and parking slots that project has — 30 and 25 for
 * the seeded ones. Paid when stock CHANGES, which is rare, so that a page view
 * keeps costing 5 reads instead of 155 (Development Plan.md §12.30).
 *
 * Deliberately not wrapped in the caller's transaction. Stats are a cache, and
 * a cache that can abort the write it describes has the dependency backwards —
 * a failed recompute must leave the unit created and the numbers stale, which
 * the next write or `npm run seed:load` repairs.
 */
export async function recomputeProjectStats(
  db: Firestore,
  projectId: string,
): Promise<ProjectStats> {
  const [units, parking] = await Promise.all([
    db.collection('units').where('projectId', '==', projectId).get(),
    db.collection('parkingSlots').where('projectId', '==', projectId).get(),
  ]);

  const stats = computeProjectStats(
    units.docs.map((d) => d.data()),
    parking.docs.map((d) => d.data()),
  );

  await db.collection('projects').doc(projectId).set({ stats }, { merge: true });
  return stats;
}

/**
 * Is any unit id already using this prefix?
 *
 * ── Why this asks the units and not the projects ─────────────────────────
 *
 * Unit ids are `{prefix}{NNN}` and the prefix is per project — `U` for The
 * Legaspi Place, `EU` for Emerald Park, then `SQ`, `GV`, `HP`. Two projects
 * sharing one would interleave their series inside a single collection: `HP031`
 * would be the next id for both, and whichever wrote second would be refused
 * or, worse, quietly take the number the other was about to use.
 *
 * The five seeded projects carry no `unitPrefix` — the field did not exist when
 * they were written — so comparing against other projects' STORED prefixes
 * would miss every one of them. The unit ids themselves cannot be out of date.
 *
 * ── Why `startAt` and a JS check rather than a range ─────────────────────
 *
 * The usual Firestore prefix trick appends U+F8FF to build an upper bound. It
 * works, and it puts an invisible private-use character into the source that
 * survives exactly as long as nothing re-encodes the file. Ordering by document
 * id and reading the FIRST id at or after the prefix answers the same question:
 * if any id starts with `HP`, that one does. Same single read, no sentinel.
 *
 * COST: 1 read.
 */
export async function unitPrefixInUse(db: Firestore, prefix: string): Promise<boolean> {
  const key = prefix.trim().toUpperCase();
  if (key === '') return false;

  const snap = await db
    .collection('units')
    .orderBy(FieldPath.documentId())
    .startAt(key)
    .limit(1)
    .get();

  return !snap.empty && snap.docs[0]!.id.toUpperCase().startsWith(key);
}

export interface UnitIdAllocation {
  readonly id: string;
  readonly prefix: string;
}

/**
 * The next free unit id for a project.
 *
 * ── Why this reads the units rather than a counter ───────────────────────
 *
 * Employee ids come from `counters/employees` because they are one flat series.
 * Unit ids are five series inside one collection, and the seeded 150 were
 * written straight from `DATABASE PROJECT.xls` with no counter behind any of
 * them. A counter per project would have to be planted for each, and would be
 * wrong the moment somebody added a unit by hand.
 *
 * A project's own units are a small, bounded set — 30 each — and reading them
 * is the authoritative answer rather than a cached guess about it.
 *
 * The prefix falls back through: the project's stored `unitPrefix`, then the
 * letters on its existing units, then the caller's suggestion. The middle step
 * is what makes this work for the five seeded projects, which have units and no
 * stored prefix.
 *
 * NOT collision-proof on its own, deliberately: two people adding a unit to the
 * same project in the same second would compute the same number. The caller
 * writes with `create()`, which fails rather than overwrites, and THAT is the
 * guarantee. This is the fast path, not the lock.
 */
export async function nextUnitId(
  db: Firestore,
  projectId: string,
  suggestedPrefix: string,
): Promise<UnitIdAllocation> {
  const [projectSnap, unitsSnap] = await Promise.all([
    db.collection('projects').doc(projectId).get(),
    db.collection('units').where('projectId', '==', projectId).get(),
  ]);

  const stored = String(projectSnap.data()?.unitPrefix ?? '')
    .trim()
    .toUpperCase();
  const fromUnits = unitsSnap.empty
    ? ''
    : unitsSnap.docs[0]!.id.replace(/\d+$/, '').toUpperCase();

  const prefix = stored || fromUnits || suggestedPrefix.trim().toUpperCase();
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  let highest = 0;
  for (const doc of unitsSnap.docs) {
    const match = pattern.exec(doc.id.toUpperCase());
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  return { id: `${prefix}${String(highest + 1).padStart(3, '0')}`, prefix };
}

/** Is this unit number already used within the project? */
export async function unitNumberTaken(
  db: Firestore,
  projectId: string,
  unitNo: string,
): Promise<boolean> {
  const snap = await db
    .collection('units')
    .where('projectId', '==', projectId)
    .where('unitNo', '==', unitNo.trim())
    .limit(1)
    .get();

  return !snap.empty;
}
