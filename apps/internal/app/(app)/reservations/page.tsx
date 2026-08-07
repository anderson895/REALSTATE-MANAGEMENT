import { getAdminFirestore, listReservationsByStatus } from '@sfsr/infrastructure/server';
import { PageHeader } from '@sfsr/ui';
import { requireModule, toActor } from '@/lib/session';
import { VERIFICATION_QUEUE } from '@/lib/reservations';
import { QueueTable } from './queue-table';
import { ActionNotice } from './notice';

/**
 * The Documentation verification queue — STEP 10 of RESERVATION.doc.
 *
 * Read uncached, unlike the dashboard. The dashboard shows figures for
 * orientation and 15 seconds of staleness is harmless there; this is a work
 * queue, and a reviewer who verifies a payment must not see the row still
 * sitting in "Pending" when the page comes back. The query is bounded, so the
 * cost is capped rather than merely typical.
 */
export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const session = await requireModule('RESERVATION_VERIFICATION');
  const { error, done } = await searchParams;

  const rows = await listReservationsByStatus(getAdminFirestore(), VERIFICATION_QUEUE, 50);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Reservations"
        description="Applications awaiting payment and documentary verification, oldest first. Open one to review the evidence before recording a decision."
      />

      <ActionNotice error={error} done={done} />

      <QueueTable
        rows={rows}
        actor={toActor(session)}
        returnTo="/reservations"
        emptyTitle="Nothing waiting on verification"
        emptyDescription="Reservations appear here as soon as a buyer submits one from the Portal. Verified applications move on to the approval queue."
      />

      <p className="mt-6 text-xs text-neutral-400">
        Showing up to 50 reservations across{' '}
        {VERIFICATION_QUEUE.length} statuses. Every decision recorded here runs inside a Firestore
        transaction alongside the unit status change and the audit entry.
      </p>
    </div>
  );
}
