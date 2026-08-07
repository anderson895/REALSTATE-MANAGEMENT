import { getAdminFirestore, listReservationsByStatus } from '@sfsr/infrastructure/server';
import { PageHeader } from '@sfsr/ui';
import { requireModule, toActor } from '@/lib/session';
import { APPROVAL_QUEUE } from '@/lib/reservations';
import { QueueTable } from '../reservations/queue-table';
import { ActionNotice } from '../reservations/notice';

/**
 * Reservations that have cleared both verification stages and are waiting on
 * a supervisor — the final stage of the transaction (RBAC.xls).
 *
 * Non-supervisors in Account Receivables still see the queue: monitoring the
 * backlog is the point of the module, and the approve button simply is not
 * drawn for them. Approval itself is refused by the entity regardless.
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const session = await requireModule('APPROVAL_MONITORING');
  const { error, done } = await searchParams;

  const rows = await listReservationsByStatus(getAdminFirestore(), APPROVAL_QUEUE, 50);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Approval Monitoring"
        description="Reservations with payment and documents verified, waiting on a supervisor. Approving one marks its unit Sold in the same transaction."
      />

      <ActionNotice error={error} done={done} />

      <QueueTable
        rows={rows}
        actor={toActor(session)}
        returnTo="/approvals"
        emptyTitle="Nothing waiting on approval"
        emptyDescription="Reservations arrive here once Documentation has verified both the reservation fee and the documentary requirements."
      />

      {!session.isSupervisor ? (
        <p className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
          You can monitor this queue but not approve from it. Approval is granted by the supervisor
          flag on your employee record, not by your role.
        </p>
      ) : null}

      <p className="mt-6 text-xs text-neutral-400">
        Open a reservation to review the evidence before approving. Approval is irreversible — the
        unit leaves inventory and only an expired reservation can be cancelled afterwards.
      </p>
    </div>
  );
}
