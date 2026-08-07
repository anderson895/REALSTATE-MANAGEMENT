import { trippingReference } from '@sfsr/domain';
import type { TrippingRow, TrippingStatus } from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { formatDate } from '@/lib/reservations';
import { TRIPPING_STATUS_LABELS, formatPreferredDate } from '@/lib/scheduling';
import { processTripping } from './actions';

/**
 * The tripping queue, drawn to INTERNAL.xls sheet `USER INTERFACE`.
 *
 * The sheet's Sales Agent dashboard shows this as a panel with a small-caps
 * navy heading over a table of REQUEST ID / PROSPECT BUYER / PROJECT INTERESTED
 * / PREFERRED DATE / STATUS / ACTION, and that column order is followed here.
 *
 * ── Where this departs from the sheet, and why ────────────────────────────
 *
 * The sheet's ACTION column is two bare icon buttons — an eye and a tick. The
 * eye is dropped: there is no tripping detail route to send it to, and a
 * control that goes nowhere is worse than one that was never drawn. The tick
 * is kept but labelled, because "Accept" and "Cancel" as two adjacent glyphs
 * is a claim queue in which the destructive option is a coin toss.
 */

export function QueuePanel({
  title,
  meta,
  rows,
  mayAct,
  empty,
}: {
  title: string;
  /** Right-hand side of the panel header — a count, in the sheet's wording. */
  meta: string;
  rows: readonly TrippingRow[];
  mayAct: boolean;
  empty?: { title: string; description: string };
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          {title}
        </h2>
        <span className="text-[11px] font-medium text-neutral-500">{meta}</span>
      </header>

      {rows.length === 0 ? (
        empty ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-800">{empty.title}</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">{empty.description}</p>
          </div>
        ) : null
      ) : (
        // Horizontal scroll rather than a stack of cards below `md`: six
        // columns of mostly-short values still read as a table on a tablet,
        // and the internal system is not used on a phone.
        <div className="overflow-x-auto">
          {/*
           * `table-fixed` plus the colgroup below, rather than letting the
           * browser size the columns from their contents.
           *
           * Each status is its own panel and therefore its own <table>, and
           * auto layout sizes each one independently — so "Unclaimed" and
           * "Accepted" came out with their columns in different places down
           * the page, which reads as three unrelated tables rather than one
           * queue in three states. Fixed widths are what make the panels line
           * up with each other.
           */}
          <table className="w-full min-w-[56rem] table-fixed text-sm">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[21%]" />
              <col className="w-[18%]" />
              <col className="w-[17%]" />
              <col className="w-[12%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                <th scope="col" className="px-5 py-2.5 font-semibold">Request ID</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Prospect buyer</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Project interested</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Preferred date</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="align-top transition-colors hover:bg-navy-50/60"
                >
                  <td className="tabular whitespace-nowrap px-5 py-3.5 font-medium text-navy-700">
                    {trippingReference(row.id, row.requestedAt)}
                  </td>

                  <td className="px-5 py-3.5">
                    <p className="font-medium text-neutral-800">
                      {row.clientName}
                    </p>
                    {row.notes ? (
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
                        {row.notes}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-5 py-3.5 text-neutral-700">
                    {row.projectName}
                  </td>

                  <td className="whitespace-nowrap px-5 py-3.5">
                    <p className="text-neutral-700">
                      {formatPreferredDate(row.preferredDate)}
                      {row.preferredTime ? (
                        <span className="text-neutral-500">, {row.preferredTime}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      asked {formatDate(row.requestedAt)}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-5 py-3.5">
                    <StatusPill status={row.status} />
                    {row.confirmedByName ? (
                      <p className="mt-1 text-[11px] text-neutral-500">by {row.confirmedByName}</p>
                    ) : null}
                  </td>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {mayAct && row.status === 'Requested' ? (
                        <ActionButton id={row.id} action="confirm" label="Accept" tone="gold" />
                      ) : null}
                      {mayAct && row.status === 'Confirmed' ? (
                        <ActionButton
                          id={row.id}
                          action="complete"
                          label="Mark visited"
                          tone="navy"
                        />
                      ) : null}
                      {mayAct && row.status !== 'Completed' && row.status !== 'Cancelled' ? (
                        <ActionButton id={row.id} action="cancel" label="Cancel" tone="ghost" />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Gold marks the one action that matters on this screen.
 *
 * Accepting is the whole point of the queue and the only step that races
 * another agent, so it gets the accent; closing a visit out is routine and
 * takes the navy. Cancel stays a ghost button — it is destructive, and giving
 * it equal weight beside Accept is how a request gets killed by muscle memory.
 */
function ActionButton({
  id,
  action,
  label,
  tone,
}: {
  id: string;
  action: string;
  label: string;
  tone: 'gold' | 'navy' | 'ghost';
}) {
  return (
    <form action={processTripping}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={cn(
          'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600',
          tone === 'gold' &&
            'bg-gold-400 text-navy-900 shadow-sm hover:bg-gold-300',
          tone === 'navy' && 'bg-navy-800 text-white hover:bg-navy-700',
          tone === 'ghost' &&
            'border border-neutral-300 text-neutral-600 hover:bg-neutral-100',
        )}
      >
        {label}
      </button>
    </form>
  );
}

/**
 * The sheet gives a new request a blue pill and a confirmed one green. The two
 * closed states are not drawn there, so they take the conventions already used
 * across both apps: navy for finished, rose for cancelled.
 */
function StatusPill({ status }: { status: TrippingStatus }) {
  const tone =
    status === 'Requested'
      ? 'bg-sky-50 text-sky-700 ring-sky-600/20'
      : status === 'Confirmed'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
        : status === 'Completed'
          ? 'bg-navy-50 text-navy-700 ring-navy-600/20'
          : 'bg-rose-50 text-rose-700 ring-rose-600/20';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        tone,
      )}
    >
      {TRIPPING_STATUS_LABELS[status]}
    </span>
  );
}
