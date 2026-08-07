import Link from 'next/link';
import { can, type InternalActor } from '@sfsr/domain';
import type { ReservationRow } from '@sfsr/infrastructure/server';
import { Card, EmptyState } from '@sfsr/ui';
import { ACTION_LABELS, actionsFor, formatDate, moduleFor } from '@/lib/reservations';
import { processReservation } from './actions';
import { ReservationBadge } from './status';

/** Whole days a reservation has been sitting in the queue. */
function daysWaiting(iso: string | null): number | null {
  if (!iso) return null;
  const elapsed = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

/**
 * The one step this employee can take on this row without opening it.
 *
 * Returns null when the choice is not obvious. A `DeficiencyNoted` reservation
 * can resume at either payment or document verification and the entity does
 * not record which stage raised it, so guessing on the reviewer's behalf would
 * be worse than making them open the record. `noteDeficiency` is excluded
 * outright — it needs a written reason the buyer will read.
 */
function quickAction(row: ReservationRow, actor: InternalActor) {
  const forward = actionsFor(row.status)
    .filter((action) => action !== 'noteDeficiency')
    .filter((action) =>
      can(actor, moduleFor(action), action === 'approve' ? 'approve' : 'modify'),
    );
  return forward.length === 1 ? forward[0] : null;
}

/**
 * The queue table, shared by verification and approvals.
 *
 * "Waiting" is shown rather than just the submission date because the number
 * a reviewer acts on is the age, not the calendar date — and because the 30-day
 * documentary deadline runs from submission, so an old row is one to open next.
 *
 * The inline button advances the obvious cases without a round trip. "Review"
 * sits beside it on every row regardless, because approving from a list means
 * approving without having looked at the receipt.
 */
export function QueueTable({
  rows,
  actor,
  returnTo,
  emptyTitle,
  emptyDescription,
}: {
  rows: readonly ReservationRow[];
  actor: InternalActor;
  /** Where the server action sends the reviewer back to. */
  returnTo: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Card>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            <th className="px-5 py-2.5 font-medium">Reservation</th>
            <th className="px-5 py-2.5 font-medium">Unit</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Submitted</th>
            <th className="px-5 py-2.5 text-right font-medium">Waiting</th>
            <th className="px-5 py-2.5 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const age = daysWaiting(row.reservedAt);
            const next = quickAction(row, actor);
            return (
              <tr
                key={row.number}
                className="align-top transition-colors hover:bg-neutral-50"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/reservations/${row.number}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {row.number}
                  </Link>
                  {row.deficiencyReason ? (
                    <p className="mt-1 max-w-md text-xs text-amber-700">
                      Deficiency: {row.deficiencyReason}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-3">{row.unitId}</td>
                <td className="px-5 py-3">
                  <ReservationBadge status={row.status} />
                </td>
                <td className="px-5 py-3 text-neutral-500">{formatDate(row.reservedAt)}</td>
                <td className="tabular px-5 py-3 text-right text-neutral-500">
                  {age === null ? '—' : `${age}d`}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {next ? (
                      <form action={processReservation}>
                        <input type="hidden" name="number" value={row.number} />
                        <input type="hidden" name="action" value={next} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          className="whitespace-nowrap rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                        >
                          {ACTION_LABELS[next]}
                        </button>
                      </form>
                    ) : null}
                    <Link
                      href={`/reservations/${row.number}`}
                      className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                    >
                      Review
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
