import 'server-only';
import { FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@sfsr/infrastructure/server';

/**
 * Development-only reset of everything a reservation touches.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * A reservation is not one document. Submitting one writes to `reservations`,
 * `payments` and `documents`, advances `counters`, holds a unit and a parking
 * slot, and appends to `auditLogs` — seven collections, deliberately, because
 * each is read by a different part of the system.
 *
 * Clearing test data by deleting one collection in the Firebase console
 * therefore leaves the other six behind. That has already happened here: a
 * deleted `reservations` collection left unit EU001 On Hold against
 * RES-2026-000001 for ever, three orphaned documents, and a counter at 3. The
 * unit could not be reserved again by anyone, because the thing that would
 * release it no longer existed.
 *
 * This clears all of it together, or none of it.
 *
 * ── Why the audit trail goes too ─────────────────────────────────────────
 *
 * `firestore.rules` refuses to delete `auditLogs` for every role including
 * IT_ADMINISTRATOR — "a log an administrator can rewrite provides no
 * assurance" — and that rule is right in production and unchanged. The Admin
 * SDK bypasses rules, which is exactly why this is fenced behind NODE_ENV.
 *
 * It has to go, because the counter goes. Leaving the log while resetting the
 * counter means the NEXT RES-2026-000001 shares a reference with the audit
 * history of a different transaction, and a reference that means two things is
 * worse than a gap. In development the log is test data; in production this
 * function does not run at all.
 */

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

export interface ResetCounts {
  readonly reservations: number;
  readonly payments: number;
  readonly documents: number;
  readonly auditLogs: number;
  readonly heldUnits: number;
  readonly heldParking: number;
  readonly counters: number;
}

/** True only in `next dev`. Every entry point re-checks this. */
export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

async function countOf(query: Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

/**
 * What a reset would remove, so the panel can say so before anything happens.
 *
 * COST: 7 count() aggregations. Cheap enough to render on every page load of
 * the dev panel, and the numbers are the whole point of showing it.
 */
export async function countResettable(): Promise<ResetCounts> {
  const db = getAdminFirestore();

  const [reservations, payments, documents, auditLogs, heldUnits, heldParking, counters] =
    await Promise.all([
      countOf(db.collection('reservations')),
      countOf(db.collection('payments')),
      countOf(db.collection('documents')),
      countOf(db.collection('auditLogs')),
      countOf(db.collection('units').where('currentReservation', '!=', null)),
      countOf(db.collection('parkingSlots').where('currentReservation', '!=', null)),
      countOf(db.collection('counters')),
    ]);

  return { reservations, payments, documents, auditLogs, heldUnits, heldParking, counters };
}

/** Deletes every document a query returns, in batches. */
async function deleteAll(db: Firestore, query: Query): Promise<number> {
  let removed = 0;
  for (;;) {
    const snap = await query.limit(BATCH_LIMIT).get();
    if (snap.empty) return removed;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    removed += snap.size;

    // A page smaller than the limit means that was the last one.
    if (snap.size < BATCH_LIMIT) return removed;
  }
}

/**
 * Clears every trace of reservation activity and puts inventory back.
 *
 * Order matters only in one respect: the holds are released LAST. If the run
 * fails halfway, a unit still tagged to a reservation that no longer exists is
 * recoverable — `scripts/repair-orphaned-reservations.ts` finds exactly that —
 * whereas a released unit with the reservation still present would let the
 * same unit be reserved twice.
 */
export async function resetReservationData(): Promise<ResetCounts> {
  if (!devToolsEnabled()) {
    throw new Error('Reservation reset is available in development only.');
  }

  const db = getAdminFirestore();

  const reservations = await deleteAll(db, db.collection('reservations'));
  const payments = await deleteAll(db, db.collection('payments'));
  const documents = await deleteAll(db, db.collection('documents'));
  const auditLogs = await deleteAll(db, db.collection('auditLogs'));
  const counters = await deleteAll(db, db.collection('counters'));

  const heldUnits = await releaseHolds(db, 'units');
  const heldParking = await releaseHolds(db, 'parkingSlots');

  return { reservations, payments, documents, auditLogs, heldUnits, heldParking, counters };
}

/**
 * Returns held inventory to Available.
 *
 * `FieldValue.delete()` on the tag rather than setting it to '' — a unit
 * carrying `currentReservation: ''` still reads as spoken for to anything that
 * checks for the field rather than its value.
 */
async function releaseHolds(db: Firestore, collection: 'units' | 'parkingSlots'): Promise<number> {
  const snap = await db.collection(collection).where('currentReservation', '!=', null).get();
  if (snap.empty) return 0;

  let released = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, {
        status: 'Available',
        currentReservation: FieldValue.delete(),
      });
      released++;
    }
    await batch.commit();
  }
  return released;
}
