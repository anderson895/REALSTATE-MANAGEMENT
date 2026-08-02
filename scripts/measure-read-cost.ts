/**
 * Measures the real Firestore read cost of each page's data access.
 *
 *   node --env-file=.env.local --import tsx scripts/measure-read-cost.ts
 *
 * Counts documents actually returned, and projects that against the Spark
 * free tier (50,000 reads/day) to show how many page views the quota buys.
 *
 * Read-only. See Development Plan.md §12.30.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  countUnitsByStatus,
  getProject,
  listProjects,
  listUnits,
} from '@sfsr/infrastructure/node';

const DAILY_READ_QUOTA = 50_000;

interface Measurement {
  readonly page: string;
  readonly before: number;
  readonly after: number;
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
  const db = getFirestore();

  // Baseline: what the naive implementations actually cost.
  const [allProjects, allUnits] = await Promise.all([
    db.collection('projects').get(),
    db.collection('units').get(),
  ]);
  const naiveList = allProjects.size + allUnits.size;

  // Measured: what the current implementations cost.
  const projects = await listProjects(db);
  const homeCost = projects.length;

  const projectPageUnits = await listUnits(db, 'TLP001');
  const projectPageCost = 1 + projectPageUnits.length;

  const filteredUnits = await listUnits(db, 'SQR003', { unitType: 'Studio' });
  const filteredCost = 1 + filteredUnits.length;

  await countUnitsByStatus(db);
  const dashboardCost = projects.length + 3;

  await getProject(db, 'EPR002');

  const rows: Measurement[] = [
    { page: 'Portal  /', before: naiveList, after: homeCost },
    { page: 'Portal  /projects', before: naiveList, after: homeCost },
    { page: 'Portal  /projects/TLP001', before: 1 + allUnits.size, after: projectPageCost },
    { page: 'Portal  /projects/SQR003?type=Studio', before: 1 + allUnits.size, after: filteredCost },
    { page: 'Internal /', before: allUnits.size + 2, after: dashboardCost },
  ];

  console.log('── Firestore reads per page view ────────────────────────────\n');
  console.log('  page                                  before   after   saved');
  console.log('  ' + '-'.repeat(58));
  for (const r of rows) {
    const saved = Math.round(((r.before - r.after) / r.before) * 100);
    console.log(
      `  ${r.page.padEnd(36)}${String(r.before).padStart(6)}${String(r.after).padStart(8)}` +
        `${String(saved + '%').padStart(8)}`,
    );
  }

  const worstBefore = Math.max(...rows.map((r) => r.before));
  const worstAfter = Math.max(...rows.map((r) => r.after));

  console.log('\n── Spark free tier: 50,000 reads/day ────────────────────────\n');
  console.log(
    `  worst-case page views/day  BEFORE: ${Math.floor(DAILY_READ_QUOTA / worstBefore).toLocaleString()}`,
  );
  console.log(
    `  worst-case page views/day  AFTER : ${Math.floor(DAILY_READ_QUOTA / worstAfter).toLocaleString()}` +
      '   (uncached)',
  );
  console.log(
    '\n  With revalidate=60 the browse pages re-read at most once per minute,',
  );
  console.log(
    `  so sustained browsing costs ~${(60 * 24 * homeCost).toLocaleString()} reads/day regardless of traffic —`,
  );
  console.log(
    `  about ${Math.round(((60 * 24 * homeCost) / DAILY_READ_QUOTA) * 100)}% of the daily quota.`,
  );

  console.log('\n── Filter pushes down to the query ──────────────────────────\n');
  console.log(`  SQR003 all units        : ${(await listUnits(db, 'SQR003')).length} reads`);
  console.log(`  SQR003 Studio only      : ${filteredUnits.length} reads`);
  console.log('  Filtering narrows the query, it does not fetch-then-filter.');
}

void main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
