/**
 * Where the ~1.5s on an Inventory tab switch actually goes.
 *
 *   node --env-file=.env.local --import tsx scripts/measure-inventory-render.ts
 *
 * Written because the obvious explanation — "it fetches too many units" — is
 * checkable, and turned out to be wrong. This times each round trip the page
 * makes, separately, so the fix lands on whichever one is actually expensive
 * instead of the one that looks expensive.
 *
 * Deliberately not a test. It measures a live network path to a Firebase
 * region, so the numbers move between runs and on a different connection; it
 * belongs beside measure-read-cost.ts as something you run when you want an
 * answer, not something that can fail a build.
 */
import { getAdminAuth, getAdminFirestore, listProjects, listUnits } from '../packages/infrastructure/src/node';

async function time<T>(label: string, fn: () => Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  const value = await fn();
  const ms = Date.now() - started;
  console.log(`  ${label.padEnd(42)} ${String(ms).padStart(5)} ms`);
  return [value, ms];
}

async function main() {
  const db = getAdminFirestore();
  const auth = getAdminAuth();

  console.log('\nOne Inventory tab switch, step by step\n');

  // The page calls requireModule -> verifySessionCookie(cookie, true). The
  // `true` is checkRevoked, and that flag is the whole question here: it makes
  // the Admin SDK fetch the user record to compare tokensValidAfterTime.
  // getUser is the same call, so it stands in for the cost without needing a
  // live cookie.
  const [users] = await time('listUsers(1) — warms the auth channel', () => auth.listUsers(1));
  const uid = users.users[0]?.uid;

  if (uid) {
    await time('getUser  — what checkRevoked: true adds', () => auth.getUser(uid));
    await time('getUser  — again, channel already open', () => auth.getUser(uid));
  }

  const [projects] = await time('listProjects() — 5 docs', () => listProjects(db));
  const first = projects[0];
  if (!first) {
    console.log('\n  No projects seeded; nothing further to measure.\n');
    return;
  }

  await time(`listUnits(${first.id}) — all`, () => listUnits(db, first.id));
  await time(`listUnits(${first.id}) — limit 15`, () => listUnits(db, first.id, { limit: 15 }));
  await time(`listUnits(${first.id}) — limit 1`, () => listUnits(db, first.id, { limit: 1 }));

  console.log('\n  Read the last three together. If limit 1 costs about what');
  console.log('  "all" costs, the row count is not the problem and paginating');
  console.log('  the query will not make the page faster.\n');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
