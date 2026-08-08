import { SALES_VISIBLE_STATUSES, isVisibleToSales } from '@sfsr/domain';
import { getAdminFirestore, listReservationsByStatus } from '@sfsr/infrastructure/server';
import { requireModule } from '@/lib/session';
import { STATUS_LABELS, formatDate } from '@/lib/reservations';
import { ReservationBadge } from '../../reservations/status';

/**
 * My Sales — what a Sales Agent is allowed to see of a reservation.
 *
 * ── Why this is not the reservation queue ─────────────────────────────────
 *
 * note.txt: "si sales agent hindi makaka receieved ng verification —
 * marerecieved lang ni sales agent kapag verified na lahat sa billing,
 * documentation, Documentation Supervisor."
 *
 * So the agent gets the OUTCOME, not the process. `/reservations` shows the
 * work in progress — a payment half-cleared, a deficiency and the reason it
 * was raised — and that screen is narrowed to Documentation and Billing by the
 * `roles` field on its menu entry. This one queries `SALES_VISIBLE_STATUSES`
 * and can therefore only ever return reservations a supervisor has signed.
 *
 * The filter is enforced three times over, on purpose (§3.3): here in the
 * query, again in the `isVisibleToSales` guard below in case the query is ever
 * loosened, and finally in firestore.rules, which refuses a SALES read of
 * anything earlier regardless of what this page asks for.
 *
 * COST: one read per matching reservation, capped at 50.
 */
export default async function SalesReservationsPage() {
  await requireModule('RESERVATION_VERIFICATION');

  const rows = (
    await listReservationsByStatus(getAdminFirestore(), SALES_VISIBLE_STATUSES, 50)
  ).filter((row) => isVisibleToSales(row.status));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">My Sales</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Reservations that have cleared Billing and Documentation and been approved. A reservation
          still being verified does not appear here.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Approved Reservations
          </h2>
          <span className="text-[11px] font-medium text-neutral-500">
            {rows.length === 0 ? 'none yet' : `${rows.length} closed`}
          </span>
        </header>

        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-800">Nothing approved yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
              A reservation lands here once Billing has cleared the payment, Documentation has
              accepted the requirements, and a Documentation Supervisor has signed it off.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                  <th scope="col" className="px-5 py-2.5 font-semibold">Reservation No.</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Unit</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Reserved</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row) => (
                  <tr key={row.number} className="align-top transition-colors hover:bg-navy-50/60">
                    <td className="tabular whitespace-nowrap px-5 py-3.5 font-medium text-navy-700">
                      {row.number}
                    </td>
                    <td className="px-5 py-3.5 text-neutral-700">{row.unitId}</td>
                    <td className="px-5 py-3.5 text-neutral-500">{formatDate(row.reservedAt)}</td>
                    <td className="px-5 py-3.5">
                      <ReservationBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3.5 text-neutral-600">
                      {row.downPaymentTier}% down · {row.paymentTerm} months
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        Showing {STATUS_LABELS.Approved.toLowerCase()}, {STATUS_LABELS.ContractSigned.toLowerCase()}{' '}
        and {STATUS_LABELS.Completed.toLowerCase()} reservations only. Anything still in
        verification belongs to Billing and Documentation.
      </p>
    </div>
  );
}
