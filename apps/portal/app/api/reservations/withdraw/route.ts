import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { MAX_WITHDRAWAL_REASON, canRequestWithdrawal, clientCan } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { getClientSession } from '@/lib/session';

/**
 * Records a buyer's voluntary withdrawal of a reservation.
 *
 * RESERVATION.doc Terms clause 5, which the buyer accepted in Step 7:
 * "voluntary withdrawal of the reservation application MAY RESULT IN
 * cancellation of the reservation IN ACCORDANCE WITH COMPANY POLICY".
 *
 * So this route records the request and NOTHING ELSE. It does not touch
 * `status`, and it does not release the unit. Development Plan.md §8.4 is the
 * company policy the clause defers to, and it is unambiguous: cancellation is
 * reached only from `Expired`, by "authorized personnel … upon management
 * approval … through the Internal Management System". `Reservation.cancel()`
 * enforces that with a two-employee rule.
 *
 * Letting this endpoint move the status would route around all of it — on one
 * click, in front of a ₱50,000 forfeiture that clause 4 calls NON-REFUNDABLE.
 */

const bodySchema = z.object({
  reservationNumber: z.string().trim().min(1),
  reason: z.string().trim().max(MAX_WITHDRAWAL_REASON).optional().default(''),
});

export async function POST(request: NextRequest) {
  const session = await getClientSession();
  // Withdrawing is part of owning a reservation, so it rides on the same
  // capability that created one. A tier that cannot reserve has nothing here
  // to withdraw.
  if (!session || !clientCan(session.tier, 'reserveUnit')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { reservationNumber, reason } = parsed.data;
  const db = getAdminFirestore();
  const ref = db.collection('reservations').doc(reservationNumber);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();

      // Ownership is checked INSIDE the transaction against the stored
      // clientId, never against anything the browser sent. Firestore rules
      // already refuse every client write to this collection; this is the
      // matching check on the one path that can write.
      if (!snap.exists || !data || data.clientId !== session.uid) {
        return { error: 'Reservation not found.', status: 404 } as const;
      }

      if (data.withdrawalRequestedAt) {
        return { error: 'A withdrawal request is already on file.', status: 409 } as const;
      }

      const status = String(data.status ?? '');
      if (!canRequestWithdrawal(status)) {
        return {
          error:
            'This reservation can no longer be withdrawn online. Please contact our office so ' +
            'the team can help you directly.',
          status: 409,
        } as const;
      }

      const at = new Date();

      tx.update(ref, {
        // Beside the status, never instead of it.
        withdrawalRequestedAt: Timestamp.fromDate(at),
        withdrawalReason: reason,
        withdrawalRequestedBy: session.uid,
      });

      // Same shape the FirestoreAuditLogger writes, so a reviewer reading the
      // audit trail sees one consistent kind of record.
      tx.create(db.collection('auditLogs').doc(), {
        type: 'reservation.withdrawal_requested',
        actor: session.uid,
        payload: { reservationNumber, statusAtRequest: status, reason },
        occurredAt: Timestamp.fromDate(at),
        recordedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true } as const;
    });

    if ('error' in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Could not record your request. Please try again.' },
      { status: 500 },
    );
  }
}
