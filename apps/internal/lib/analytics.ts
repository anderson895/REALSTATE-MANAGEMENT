import { unstable_cache } from 'next/cache';
import { RESERVATION_STATUSES, type ReservationStatus } from '@sfsr/domain';
import {
  countReservationsByStatus,
  countUnitsByProject,
  getAdminFirestore,
  listProjects,
} from '@sfsr/infrastructure/server';
import { STATUS_LABELS } from './reservations';

/**
 * Every figure on the dashboard, in one cached snapshot.
 *
 * ── Read budget ───────────────────────────────────────────────────────────
 *
 * COST on a cache miss: 5 reads (project names, prices, parking) + 15 count()
 * aggregations for units by project + 9 for reservations by status = 29, flat.
 * Zero on a hit, and it does not grow as the collections do.
 *
 * Nothing here fetches a collection to tally it. An earlier version pulled 120
 * reservation documents to produce nine pipeline numbers; at one refresh a
 * minute that alone would have burned 172,000 reads a day against a 50,000
 * daily Spark allowance.
 *
 * Unit counts are live count() aggregations, NOT the denormalised `stats`
 * block on each project. Nothing in the reservation workflow maintains that
 * block — only scripts/seed/recompute-stats.ts writes it — so it reported 150
 * units available while one sat On Hold. Prices and parking still come from
 * `stats`, because verifying a payment reprices nothing.
 *
 * 60 seconds of staleness. Nobody decides anything on a chart the way they do
 * on a work queue, and the `units`/`projects` tags mean verifying a payment or
 * approving a reservation refreshes it immediately regardless.
 */

const ANALYTICS_TTL_SECONDS = 60;

export interface StatusSlice {
  readonly name: string;
  readonly value: number;
}

export interface ProjectBar {
  readonly project: string;
  readonly Available: number;
  readonly 'On Hold': number;
  readonly Sold: number;
}

export interface PriceBar {
  readonly project: string;
  /** Pesos, not centavos — these are axis labels, not money to compute with. */
  readonly lowest: number;
  readonly highest: number;
}

export interface PipelineBar {
  readonly status: string;
  readonly count: number;
}

/** A row of the "By project" table — the same live counts the charts use. */
export interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly available: number;
  readonly onHold: number;
  readonly sold: number;
  readonly availableParking: number;
  readonly totalParking: number;
  /**
   * Costs nothing — it is already on the project document `listProjects` reads
   * for the prices and parking. Null for The Legaspi Place, which has no render
   * at all (§12.10); the table draws a branded placeholder, not a broken image.
   */
  readonly heroImageUrl: string | null;
}

export interface AnalyticsSnapshot {
  /**
   * When this snapshot was BUILT, not when it was read.
   *
   * Stamped inside the cached function on purpose: `unstable_cache` returns the
   * same object until the TTL lapses, so this is the age of the figures on
   * screen rather than the age of the request. That is exactly what "Last
   * updated" has to mean, and taking `new Date()` in the component would make
   * a sixty-second-old number claim to be current.
   */
  readonly generatedAt: string;
  readonly totalUnits: number;
  readonly available: number;
  readonly onHold: number;
  readonly sold: number;
  readonly totalParking: number;
  readonly projectCount: number;
  readonly highestPriceCentavos: number;
  readonly sellThroughPct: number;
  readonly activeReservations: number;
  readonly projects: readonly ProjectRow[];
  readonly inventoryMix: readonly StatusSlice[];
  readonly byProject: readonly ProjectBar[];
  readonly priceByProject: readonly PriceBar[];
  readonly pipeline: readonly PipelineBar[];
}

/**
 * Always charted, even at zero — these five are the pipeline itself, and a
 * stage that vanishes when empty makes the funnel look shorter than it is.
 * The four terminal statuses appear only once something reaches them.
 */
const CORE_PIPELINE: readonly ReservationStatus[] = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DocumentsVerified',
  'Approved',
  'DeficiencyNoted',
];

/** Trims "The Legaspi Place" to something that fits under a bar. */
function shortName(name: string): string {
  return name.replace(/^The\s+/i, '');
}

async function buildSnapshot(): Promise<AnalyticsSnapshot> {
  const db = getAdminFirestore();
  const projects = await listProjects(db);
  const [counts, byStatus] = await Promise.all([
    countUnitsByProject(
      db,
      projects.map((p) => p.id),
    ),
    countReservationsByStatus(db),
  ]);

  const tally = (pick: (c: { Available: number; 'On Hold': number; Sold: number }) => number) =>
    projects.reduce((n, p) => {
      const bucket = counts[p.id];
      return n + (bucket ? pick(bucket) : 0);
    }, 0);

  const available = tally((c) => c.Available);
  const onHold = tally((c) => c['On Hold']);
  const sold = tally((c) => c.Sold);
  const totalUnits = available + onHold + sold;

  const pipeline = RESERVATION_STATUSES.filter(
    (status) => CORE_PIPELINE.includes(status) || byStatus[status] > 0,
  ).map((status) => ({
    status: STATUS_LABELS[status],
    count: byStatus[status],
  }));

  // "Active" excludes the three dead ends: what is still moving through the
  // system, which is the number a supervisor is actually watching.
  const activeReservations = RESERVATION_STATUSES.filter(
    (status) => status !== 'Cancelled' && status !== 'Expired' && status !== 'Completed',
  ).reduce((n, status) => n + byStatus[status], 0);

  return {
    generatedAt: new Date().toISOString(),
    totalUnits,
    available,
    onHold,
    sold,
    totalParking: projects.reduce((n, p) => n + p.stats.totalParking, 0),
    projectCount: projects.length,
    highestPriceCentavos: projects.reduce(
      (max, p) => Math.max(max, p.stats.maxPriceCentavos ?? 0),
      0,
    ),
    sellThroughPct: totalUnits === 0 ? 0 : Math.round(((onHold + sold) / totalUnits) * 100),
    activeReservations,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      available: counts[p.id]?.Available ?? 0,
      onHold: counts[p.id]?.['On Hold'] ?? 0,
      sold: counts[p.id]?.Sold ?? 0,
      availableParking: p.stats.availableParking,
      totalParking: p.stats.totalParking,
      heroImageUrl: p.heroImageUrl,
    })),
    inventoryMix: [
      { name: 'Available', value: available },
      { name: 'On Hold', value: onHold },
      { name: 'Sold', value: sold },
    ],
    byProject: projects.map((p) => ({
      project: shortName(p.name),
      Available: counts[p.id]?.Available ?? 0,
      'On Hold': counts[p.id]?.['On Hold'] ?? 0,
      Sold: counts[p.id]?.Sold ?? 0,
    })),
    priceByProject: projects.map((p) => ({
      project: shortName(p.name),
      lowest: Math.round((p.stats.minPriceCentavos ?? 0) / 100),
      highest: Math.round((p.stats.maxPriceCentavos ?? 0) / 100),
    })),
    pipeline,
  };
}

export const getAnalytics = unstable_cache(buildSnapshot, ['internal', 'analytics'], {
  revalidate: ANALYTICS_TTL_SECONDS,
  tags: ['projects', 'units'],
});
