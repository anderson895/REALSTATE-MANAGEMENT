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
import { computeProjectStats } from '@sfsr/infrastructure/node';

/**
 * The arithmetic lives in `@sfsr/infrastructure`, not here.
 *
 * Marketing can now add units from /inventory, and that write recomputes the
 * affected project on its own. Two implementations of these numbers is two
 * places that can disagree about how many units are available, so both call
 * `computeProjectStats`. What legitimately differs is the FETCHING: this scans
 * all three collections once for a bulk run, the app reads a single project's
 * documents after a single change.
 */
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
    const stats = computeProjectStats(
      units.docs.filter((u) => u.data().projectId === project.id).map((u) => u.data()),
      parking.docs.filter((p) => p.data().projectId === project.id).map((p) => p.data()),
    );

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
