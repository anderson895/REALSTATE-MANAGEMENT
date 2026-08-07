import type { InternalRole, ReservationStatus } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { APPROVAL_QUEUE, VERIFICATION_QUEUE } from './reservations';

/**
 * What is waiting on this desk, for the bell in the topbar.
 *
 * ── Why this is not a notification feed ───────────────────────────────────
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws a bell with a count on it, and
 * `firestore.rules` already reserves `/notifications/{id}` for one. Nothing
 * writes that collection yet — it does not exist in the database — so a badge
 * reading from it would be permanently zero, and a badge invented to look like
 * the mockup would be a number that means nothing.
 *
 * This counts the real thing instead: how many records are sitting in THIS
 * role's queue right now. It is the number the bell is for — "there is work" —
 * and it is true today rather than after a notification system is built.
 *
 * When the feed does arrive, this is the function to change, and the bell will
 * not need touching.
 *
 * COST: 1 count() aggregation, or 0 for a role with no queue.
 */

/** Reservation statuses each role is responsible for clearing. */
const RESERVATION_QUEUES: Partial<Record<InternalRole, readonly ReservationStatus[]>> = {
  DOCUMENTATION: VERIFICATION_QUEUE,
  ACCOUNT_RECEIVABLES: APPROVAL_QUEUE,
  // An IT Administrator holds every module but owns no queue; showing them the
  // Documentation backlog would be someone else's work on their bell.
};

export async function countWaitingFor(role: InternalRole): Promise<number> {
  const db = getAdminFirestore();

  if (role === 'SALES') {
    // Sales works a claim queue, not a reservation one: unclaimed trippings.
    const snap = await db
      .collection('trippings')
      .where('status', '==', 'Requested')
      .count()
      .get();
    return snap.data().count;
  }

  const statuses = RESERVATION_QUEUES[role];
  if (!statuses || statuses.length === 0) return 0;

  const snap = await db
    .collection('reservations')
    .where('status', 'in', [...statuses])
    .count()
    .get();
  return snap.data().count;
}

/** Where the bell takes you — the queue the count came from. */
export function queueHrefFor(role: InternalRole): string | null {
  if (role === 'SALES') return '/scheduling';
  if (role === 'DOCUMENTATION') return '/reservations';
  if (role === 'ACCOUNT_RECEIVABLES') return '/approvals';
  return null;
}
