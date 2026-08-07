/**
 * Copies each reservation's project id onto the reservation itself.
 *
 *   node --env-file=.env.local --import tsx scripts/backfill-reservation-project.ts [--apply]
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 * A reservation records `unitId` and nothing about the project behind it, so
 * the Documentation dashboard's per-project counters had no field to aggregate
 * on. The Portal now writes `projectId` at submit (see apps/portal/app/api/
 * reservations/route.ts); this fills it in for reservations taken before that.
 *
 * Idempotent: rows that already carry a projectId are skipped, so running it
 * twice costs a read per reservation and changes nothing.
 */
import { getAdminFirestore } from '../packages/infrastructure/src/node';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const db = getAdminFirestore();
  console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN — nothing will be written. Pass --apply.\n');

  const reservations = await db.collection('reservations').get();
  if (reservations.empty) {
    console.log('No reservations.');
    return;
  }

  // One read per DISTINCT unit rather than per reservation: several
  // reservations over time can point at the same unit.
  const needed = reservations.docs.filter((doc) => !doc.data().projectId);
  const unitIds = [...new Set(needed.map((doc) => String(doc.data().unitId ?? '')).filter(Boolean))];

  const units = new Map<string, string | null>();
  if (unitIds.length > 0) {
    const snaps = await db.getAll(...unitIds.map((id) => db.collection('units').doc(id)));
    for (const snap of snaps) {
      units.set(snap.id, snap.exists ? (snap.data()?.projectId ?? null) : null);
    }
  }

  let filled = 0;
  let missing = 0;

  for (const doc of needed) {
    const unitId = String(doc.data().unitId ?? '');
    const projectId = units.get(unitId) ?? null;

    if (!projectId) {
      missing++;
      console.log(`  SKIP    ${doc.id}  (unit ${unitId || '?'} has no project)`);
      continue;
    }

    console.log(`  backfill ${doc.id}  ${unitId} -> ${projectId}`);
    filled++;
    if (APPLY) await doc.ref.update({ projectId });
  }

  const already = reservations.size - needed.length;
  console.log(
    `\n${filled} to fill, ${already} already set, ${missing} unresolvable, of ${reservations.size}.`,
  );
  if (!APPLY && filled > 0) console.log('Re-run with --apply to write.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
