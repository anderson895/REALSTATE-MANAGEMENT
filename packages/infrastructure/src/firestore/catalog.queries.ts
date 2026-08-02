import type { Firestore } from 'firebase-admin/firestore';

/**
 * Read-budget-aware queries for the public catalogue.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Firebase Spark (free) allows 50,000 document reads per day. A naive
 * landing page that counts available units by fetching them costs 155 reads
 * per view — about 320 views before the project stops serving.
 *
 * Three rules are enforced here rather than left to each page:
 *
 *   1. NEVER fetch a collection to count or aggregate it. Read the
 *      denormalised `stats` on the project document, or use `count()`, which
 *      bills one read per 1,000 index entries rather than one per document.
 *   2. EVERY query is bounded by an explicit limit. An unbounded query is a
 *      quota incident waiting for the collection to grow.
 *   3. Pages set `revalidate`, never `force-dynamic`, so repeated views inside
 *      the window cost nothing at all.
 *
 * See Development Plan.md §12.30.
 */

/** Hard ceiling for any single catalogue query. */
export const MAX_UNITS_PER_QUERY = 200;

export interface ProjectStats {
  readonly totalUnits: number;
  readonly availableUnits: number;
  readonly onHoldUnits: number;
  readonly soldUnits: number;
  readonly totalParking: number;
  readonly availableParking: number;
  readonly minPriceCentavos: number | null;
  readonly maxPriceCentavos: number | null;
  readonly unitTypes: readonly string[];
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly theme: string;
  readonly code: string;
  readonly developer: string;
  readonly buildingType: string;
  readonly floors: string;
  readonly heroImageUrl: string | null;
  readonly floorPlans: Readonly<Record<string, string>>;
  readonly stats: ProjectStats;
}

const EMPTY_STATS: ProjectStats = {
  totalUnits: 0,
  availableUnits: 0,
  onHoldUnits: 0,
  soldUnits: 0,
  totalParking: 0,
  availableParking: 0,
  minPriceCentavos: null,
  maxPriceCentavos: null,
  unitTypes: [],
};

function toSummary(id: string, raw: FirebaseFirestore.DocumentData): ProjectSummary {
  return {
    id,
    name: String(raw.name ?? id),
    location: String(raw.location ?? ''),
    theme: String(raw.theme ?? ''),
    code: String(raw.code ?? id),
    developer: String(raw.developer ?? ''),
    buildingType: String(raw.buildingType ?? ''),
    floors: String(raw.floorsRaw ?? ''),
    heroImageUrl: raw.heroImageUrl ? String(raw.heroImageUrl) : null,
    floorPlans: (raw.floorPlans ?? {}) as Record<string, string>,
    stats: { ...EMPTY_STATS, ...((raw.stats ?? {}) as Partial<ProjectStats>) },
  };
}

/**
 * All projects with their pre-computed inventory counts.
 *
 * COST: 5 reads (one per project). The naive version — fetching units to count
 * them — cost 155.
 */
export async function listProjects(db: Firestore): Promise<ProjectSummary[]> {
  const snap = await db.collection('projects').limit(50).get();
  return snap.docs.map((doc) => toSummary(doc.id, doc.data())).sort((a, b) => a.id.localeCompare(b.id));
}

/** COST: 1 read. */
export async function getProject(db: Firestore, projectId: string): Promise<ProjectSummary | null> {
  const doc = await db.collection('projects').doc(projectId).get();
  const data = doc.data();
  return doc.exists && data ? toSummary(doc.id, data) : null;
}

export interface UnitFilters {
  readonly tower?: string;
  readonly unitType?: string;
  readonly status?: string;
  readonly limit?: number;
}

export interface UnitRow {
  readonly id: string;
  readonly projectId: string;
  readonly tower: string | null;
  readonly floor: number;
  readonly unitNo: string;
  readonly unitType: string;
  readonly areaSqm: number;
  readonly pricePerSqmCentavos: number;
  readonly purchasePriceCentavos: number;
  readonly status: string;
}

function toUnitRow(id: string, raw: FirebaseFirestore.DocumentData): UnitRow {
  return {
    id,
    projectId: String(raw.projectId ?? ''),
    tower: raw.tower ? String(raw.tower) : null,
    floor: Number(raw.floor ?? 0),
    unitNo: String(raw.unitNo ?? ''),
    unitType: String(raw.unitType ?? ''),
    areaSqm: Number(raw.areaSqm ?? 0),
    pricePerSqmCentavos: Number(raw.pricePerSqmCentavos ?? 0),
    purchasePriceCentavos: Number(raw.purchasePriceCentavos ?? 0),
    status: String(raw.status ?? 'Available'),
  };
}

/**
 * Units in one project, optionally filtered.
 *
 * COST: one read per matching unit, capped at `MAX_UNITS_PER_QUERY`. The
 * largest project holds 30 units, so a project page costs at most 30 reads —
 * and 0 on a cached view.
 *
 * Filters are applied server-side so a narrowed view genuinely reads less.
 */
export async function listUnits(
  db: Firestore,
  projectId: string,
  filters: UnitFilters = {},
): Promise<UnitRow[]> {
  let query = db
    .collection('units')
    .where('projectId', '==', projectId) as FirebaseFirestore.Query;

  if (filters.status) query = query.where('status', '==', filters.status);
  if (filters.unitType) query = query.where('unitType', '==', filters.unitType);
  if (filters.tower) query = query.where('tower', '==', filters.tower);

  const cap = Math.min(filters.limit ?? MAX_UNITS_PER_QUERY, MAX_UNITS_PER_QUERY);
  const snap = await query.limit(cap).get();

  return snap.docs
    .map((doc) => toUnitRow(doc.id, doc.data()))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** COST: 1 read. */
export async function getUnit(db: Firestore, unitId: string): Promise<UnitRow | null> {
  const doc = await db.collection('units').doc(unitId).get();
  const data = doc.data();
  return doc.exists && data ? toUnitRow(doc.id, data) : null;
}

export interface ParkingRow {
  readonly id: string;
  readonly projectId: string;
  readonly tower: string | null;
  readonly level: string;
  readonly parkingNo: string;
  readonly parkingType: string;
  readonly areaSqm: number;
  readonly purchasePriceCentavos: number;
  readonly status: string;
}

/**
 * Available parking slots for a project.
 *
 * Only fetched on the reservation wizard, where the buyer actually picks one.
 * The unit page shows availability from the denormalised project stats
 * instead, so browsing never pays for 30 parking documents.
 */
export async function listAvailableParking(
  db: Firestore,
  projectId: string,
  limit = 60,
): Promise<ParkingRow[]> {
  const snap = await db
    .collection('parkingSlots')
    .where('projectId', '==', projectId)
    .where('status', '==', 'Available')
    .limit(limit)
    .get();

  return snap.docs
    .map((doc) => {
      const raw = doc.data();
      return {
        id: doc.id,
        projectId: String(raw.projectId ?? ''),
        tower: raw.tower ? String(raw.tower) : null,
        level: String(raw.level ?? ''),
        parkingNo: String(raw.parkingNo ?? ''),
        parkingType: String(raw.parkingType ?? ''),
        areaSqm: Number(raw.areaSqm ?? 0),
        purchasePriceCentavos: Number(raw.purchasePriceCentavos ?? 0),
        status: String(raw.status ?? 'Available'),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Counts by unit status across the whole portfolio.
 *
 * COST: 3 reads. `count()` bills one read per 1,000 index entries scanned, so
 * counting 150 units costs 1 — not 150.
 */
export async function countUnitsByStatus(db: Firestore): Promise<Record<string, number>> {
  const statuses = ['Available', 'On Hold', 'Sold'] as const;
  const counts = await Promise.all(
    statuses.map((status) =>
      db.collection('units').where('status', '==', status).count().get(),
    ),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i]?.data().count ?? 0]));
}
