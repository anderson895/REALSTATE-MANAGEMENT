/**
 * Denormalises per-project inventory counts onto the `projects` documents.
 *
 *   node --env-file=.env.local --import tsx scripts/seed/recompute-stats.ts
 *
 * WHY THIS EXISTS — Firestore read budget.
 *
 * The landing page needs, per project: how many units are available, and the
 * cheapest one. Computing that from the unit collection costs 150 reads per
 * page view. On the Spark free tier (50,000 reads/day) that is ~320 page views
 * before the project stops serving — under a minute of a defense panel
 * clicking around.
 *
 * Storing the answer on the project document turns those 150 reads into 5.
 * The trade-off is staleness: these numbers are recomputed here and by the
 * seed, not on every unit change. That is acceptable for browse pages — the
 * authoritative status is always read from the unit itself on the unit page
 * and inside the reservation transaction, which is what actually prevents
 * double-selling.
 *
 * Called automatically at the end of `npm run seed:load`.
 */
import { pathToFileURL } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface ProjectStats {
  readonly totalUnits: number;
  readonly availableUnits: number;
  readonly onHoldUnits: number;
  readonly soldUnits: number;
  readonly totalParking: number;
  readonly availableParking: number;
  readonly minPriceCentavos: number | null;
  readonly maxPriceCentavos: number | null;
  readonly unitTypes: string[];
}

export async function recomputeStats(db: Firestore, quiet = false): Promise<void> {
  // One full scan here, so that every page view afterwards costs 5 reads
  // instead of 155. This script runs on demand, not per request.
  const [projects, units, parking] = await Promise.all([
    db.collection('projects').get(),
    db.collection('units').get(),
    db.collection('parkingSlots').get(),
  ]);

  if (!quiet) {
    console.log('\n── Recomputing project stats ────────────────────');
  }

  for (const project of projects.docs) {
    const mine = units.docs.filter((u) => u.data().projectId === project.id);
    const myParking = parking.docs.filter((p) => p.data().projectId === project.id);
    const prices = mine
      .map((u) => Number(u.data().purchasePriceCentavos ?? 0))
      .filter((n) => n > 0);

    const stats: ProjectStats = {
      totalUnits: mine.length,
      availableUnits: mine.filter((u) => u.data().status === 'Available').length,
      onHoldUnits: mine.filter((u) => u.data().status === 'On Hold').length,
      soldUnits: mine.filter((u) => u.data().status === 'Sold').length,
      totalParking: myParking.length,
      availableParking: myParking.filter((p) => p.data().status === 'Available').length,
      minPriceCentavos: prices.length ? Math.min(...prices) : null,
      maxPriceCentavos: prices.length ? Math.max(...prices) : null,
      unitTypes: [...new Set(mine.map((u) => String(u.data().unitType)))].sort(),
    };

    await project.ref.set({ stats, statsComputedAt: FieldValue.serverTimestamp() }, { merge: true });

    if (!quiet) {
      console.log(
        `  ${project.id}  ${String(stats.availableUnits).padStart(3)}/${String(stats.totalUnits).padEnd(3)} available` +
          `  parking ${String(stats.availableParking).padStart(3)}/${String(stats.totalParking).padEnd(3)}` +
          `  types ${stats.unitTypes.length}`,
      );
    }
  }

  if (!quiet) {
    console.log(
      `\n  Landing page read cost: ${units.size + projects.size} -> ${projects.size} per view`,
    );
  }
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
  await recomputeStats(getFirestore());
}

// Only run when invoked directly, so `load.ts` can import recomputeStats.
// pathToFileURL handles the Windows drive-letter form — hand-building
// `file://${argv[1]}` yields `file://D:/…` where import.meta.url has
// `file:///D:/…`, and the comparison silently never matches.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void main().catch((e: unknown) => {
    console.error('FAILED:', (e as Error).message);
    process.exit(1);
  });
}
