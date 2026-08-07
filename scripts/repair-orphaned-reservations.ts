/**
 * Repairs the state a deleted reservation leaves behind.
 *
 *   node --env-file=.env.local --import tsx scripts/repair-orphaned-reservations.ts [--apply]
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 * ── Why this is needed ────────────────────────────────────────────────────
 *
 * A reservation is not a single document. Submitting one holds a unit, files
 * the buyer's documents, advances the yearly counter and appends to the audit
 * trail — four collections, deliberately, because each is read by a different
 * part of the system.
 *
 * Deleting the `reservations` collection from the Firebase console removes only
 * the first of those. The unit stays On Hold pointing at a reservation that no
 * longer exists, so it is out of inventory permanently: nothing can release it,
 * because the thing that would release it is gone.
 *
 * ── What this deliberately does NOT touch ─────────────────────────────────
 *
 * `auditLogs`. It is append-only by design and firestore.rules refuses update
 * and delete on it for every role including IT_ADMINISTRATOR — "a log an
 * administrator can rewrite provides no assurance" (§3.6). After a deletion it
 * is the ONLY remaining record that those reservations ever existed, which is
 * precisely the job it was given.
 *
 * `counters/reservations-{year}`. Rewinding it would make the next reservation
 * reuse a number the audit trail already has against a different transaction,
 * so a future RES-2026-000001 would collide with the history of the deleted
 * one. A gap in the series is a smaller problem than an ambiguous reference:
 * the counter is a high-water mark, not a population count.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../packages/infrastructure/src/node';

const APPLY = process.argv.includes('--apply');

/** Collections that tag a document with the reservation that owns it. */
const HELD_COLLECTIONS = ['units', 'parkingSlots'] as const;

async function main(): Promise<void> {
  const db = getAdminFirestore();
  console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN — nothing will be written. Pass --apply.\n');

  // Cache the existence check: several documents can point at one reservation.
  const alive = new Map<string, boolean>();
  async function reservationExists(number: string): Promise<boolean> {
    const cached = alive.get(number);
    if (cached !== undefined) return cached;
    const snap = await db.collection('reservations').doc(number).get();
    alive.set(number, snap.exists);
    return snap.exists;
  }

  let released = 0;
  let deleted = 0;

  for (const name of HELD_COLLECTIONS) {
    const snap = await db.collection(name).where('currentReservation', '!=', null).get();
    for (const doc of snap.docs) {
      const number = String(doc.data().currentReservation ?? '');
      if (!number || (await reservationExists(number))) continue;

      console.log(`  release ${name}/${doc.id}  (was ${doc.data().status}, held by ${number})`);
      released++;
      if (APPLY) {
        // Back to Available and the tag REMOVED, not blanked — a unit carrying
        // currentReservation: '' still reads as "spoken for" to anything that
        // checks for the field rather than its value.
        await doc.ref.update({
          status: 'Available',
          currentReservation: FieldValue.delete(),
        });
      }
    }
  }

  const docs = await db.collection('documents').get();
  for (const doc of docs.docs) {
    const raw = doc.data();
    const number = String(raw.reservationNumber ?? raw.reservationId ?? '');
    if (!number || (await reservationExists(number))) continue;

    console.log(`  delete  documents/${doc.id}  (${raw.docType ?? 'document'} for ${number})`);
    deleted++;
    if (APPLY) await doc.ref.delete();
  }

  console.log(`\n${released} hold(s) released, ${deleted} orphaned document(s) removed.`);
  if (!APPLY && released + deleted > 0) console.log('Re-run with --apply to write.');

  // Stated rather than silently skipped: someone reading this output should not
  // have to infer what was left alone.
  const audit = (await db.collection('auditLogs').count().get()).data().count;
  console.log(`\nUntouched: auditLogs (${audit} entries), counters. See the note at the top.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
