import Link from 'next/link';
import {
  BadgeCheck,
  Banknote,
  FileWarning,
  FileX2,
  HandCoins,
  Landmark,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { InternalActor } from '@sfsr/domain';
import type { PaymentQueueRow, StatusByProject } from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { ACTION_LABELS, actionsFor, canTakeAction, formatCentavos, formatDate } from '@/lib/reservations';
import { BILLING_CARDS } from '@/lib/billing';
import { ReservationBadge } from './reservations/status';
import type { SummaryCard } from '@/lib/documentation';

/**
 * The Billing Section dashboard, from INTERNAL.xls sheet `USER INTERFACE`.
 *
 * The same shape as the Documentation dashboard on purpose — counters across
 * the top with a per-project split, the desk's queue below, a reference panel
 * beside it. One product, one screen, different contents.
 *
 * ── Where the money comes from ───────────────────────────────────────────
 *
 * The `payments` collection supplies the amount, the channel and the
 * reference. It does NOT supply whether the payment cleared: every record in
 * it reads `Pending Verification` for ever, because the Portal writes that at
 * submit and nothing has ever updated it. Cleared/outstanding is read off the
 * reservation's `paymentVerifiedBy` instead — see `listPaymentQueue`.
 */

const TONES: Record<SummaryCard['tone'], string> = {
  navy: 'bg-navy-800',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
};

const CARD_ICONS: Record<string, LucideIcon> = {
  awaiting: HandCoins,
  cleared: Banknote,
  withDocs: BadgeCheck,
  incomplete: FileWarning,
  approved: Landmark,
  cancelled: FileX2,
};

export function BillingDashboard({
  byStatusProject,
  collectedCentavos,
  projects,
  queue,
  actor,
}: {
  byStatusProject: Record<string, StatusByProject>;
  collectedCentavos: number;
  projects: readonly { id: string; name: string }[];
  queue: readonly PaymentQueueRow[];
  actor: InternalActor;
}) {
  const outstanding = queue.reduce((sum, row) => sum + row.amountCentavos, 0);

  return (
    <>
      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Project Payment Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {BILLING_CARDS.map((card) => {
            const bucket = card.status ? byStatusProject[card.status] : undefined;
            return (
              <SummaryTile
                key={card.key}
                card={card}
                total={bucket?.total ?? 0}
                byProject={bucket?.byProject ?? {}}
                projects={projects}
              />
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <PaymentQueue queue={queue} actor={actor} />
        <Collections collected={collectedCentavos} outstanding={outstanding} rows={queue.length} />
      </div>
    </>
  );
}

function SummaryTile({
  card,
  total,
  byProject,
  projects,
}: {
  card: SummaryCard;
  total: number;
  byProject: Readonly<Record<string, number>>;
  projects: readonly { id: string; name: string }[];
}) {
  const Icon = CARD_ICONS[card.key] ?? Wallet;
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white',
            TONES[card.tone],
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <p className="text-[11px] font-bold leading-tight text-navy-800">{card.label}</p>
      </div>

      <ul className="mt-3 space-y-1.5">
        {projects.map((project) => (
          <li key={project.id} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-neutral-600">{project.name}</span>
            <span className="tabular shrink-0 font-semibold text-navy-800">
              {byProject[project.id] ?? 0}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Total</span>
        <span className="tabular text-lg font-bold leading-none text-navy-800">{total}</span>
      </div>

      {card.href ? (
        <p className="mt-2.5 text-[11px] font-semibold text-navy-500 group-hover:underline">
          View details ›
        </p>
      ) : null}
    </>
  );

  const shell = 'rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5 shadow-sm';

  return card.href ? (
    <Link href={card.href} className={cn(shell, 'group transition-colors hover:border-navy-300')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

function PaymentQueue({
  queue,
  actor,
}: {
  queue: readonly PaymentQueueRow[];
  actor: InternalActor;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Payment Verification Queue
        </h2>
        <span className="text-[11px] font-medium text-neutral-500">
          {queue.length === 0 ? 'nothing waiting' : `${queue.length} waiting`}
        </span>
      </header>

      {queue.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-navy-800">No payments waiting</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
            A reservation appears here the moment a buyer submits their proof of payment from the
            Portal, or a walk-in is raised at the counter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] table-fixed text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[17%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                <th scope="col" className="px-5 py-2.5 font-semibold">Reservation No.</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Buyer</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Amount</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {queue.map((row) => (
                <QueueRow key={row.number} row={row} actor={actor} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QueueRow({ row, actor }: { row: PaymentQueueRow; actor: InternalActor }) {
  // `deficiencyDueAt` is not carried on this row, so `markExpired` never
  // surfaces here — expiring belongs on the record, where the reason is.
  const next = actionsFor({
    status: row.status,
    paymentVerifiedBy: row.paymentVerifiedBy,
    documentsVerifiedBy: null,
  })
    .filter((action) => action !== 'noteDeficiency' && action !== 'markExpired')
    .filter((action) => canTakeAction(actor, action));

  return (
    <tr className="align-top transition-colors hover:bg-navy-50/60">
      <td className="tabular px-5 py-3.5">
        <Link
          href={`/reservations/${row.number}`}
          className="whitespace-nowrap font-medium text-navy-700 hover:underline"
        >
          {row.number}
        </Link>
        <p className="mt-0.5 text-[11px] text-neutral-400">{formatDate(row.reservedAt)}</p>
      </td>

      <td className="px-5 py-3.5">
        <p className="font-medium text-neutral-800">{row.buyerName}</p>
        <p className="mt-0.5 text-[11px] text-neutral-400">{row.unitId}</p>
      </td>

      <td className="px-5 py-3.5 text-neutral-700">{row.projectName}</td>

      <td className="px-5 py-3.5">
        <p className="tabular whitespace-nowrap font-semibold text-navy-800">
          {formatCentavos(row.amountCentavos)}
        </p>
        {/* The reference is what a clerk matches against the bank statement,
            so it sits with the amount rather than in a column of its own. */}
        <p className="mt-0.5 truncate text-[11px] text-neutral-500">
          {[row.channel, row.referenceNumber].filter(Boolean).join(' · ') || 'No payment attached'}
        </p>
      </td>

      {/* Not `whitespace-nowrap` on the cell: the badge keeps its own shape,
          but a deficiency reason set nowrap ran straight out of the column and
          under the action buttons. */}
      <td className="px-5 py-3.5">
        <ReservationBadge status={row.status} />
        {row.deficiencyReason ? (
          <p className="mt-1 break-words text-[11px] leading-snug text-amber-700">
            {row.deficiencyReason}
          </p>
        ) : null}
      </td>

      <td className="px-5 py-3.5">
        <div className="flex flex-col items-end gap-1.5">
          {next.length === 1 && next[0] ? (
            <Link
              href={`/reservations/${row.number}`}
              className="w-full max-w-[10rem] whitespace-nowrap rounded-md bg-gold-400 px-2.5 py-1.5 text-center text-[11px] font-semibold text-navy-900 shadow-sm transition-colors hover:bg-gold-300"
            >
              {ACTION_LABELS[next[0]]}
            </Link>
          ) : null}
          <Link
            href={`/reservations/${row.number}`}
            className="w-full max-w-[10rem] whitespace-nowrap rounded-md border border-neutral-300 px-2.5 py-1.5 text-center text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            View receipt
          </Link>
        </div>
      </td>
    </tr>
  );
}

/**
 * The money panel, where Documentation has the client masterfile.
 *
 * "Collected" counts only what this desk has CLEARED, not every receipt
 * uploaded — a collections figure made of unverified receipts is a number
 * someone repeats in a meeting and then has to take back.
 */
function Collections({
  collected,
  outstanding,
  rows,
}: {
  collected: number;
  outstanding: number;
  rows: number;
}) {
  return (
    <aside className="h-fit overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Collections
        </h2>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Verified collections
          </p>
          <p className="tabular mt-1 text-2xl font-bold leading-none text-emerald-600">
            {formatCentavos(collected)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            Reservation fees this desk has confirmed reaching the bank.
          </p>
        </div>

        <div className="border-t border-neutral-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            Awaiting verification
          </p>
          <p className="tabular mt-1 text-2xl font-bold leading-none text-amber-600">
            {formatCentavos(outstanding)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            Across {rows} {rows === 1 ? 'reservation' : 'reservations'} in the queue. Submitted, not
            yet confirmed.
          </p>
        </div>
      </div>
    </aside>
  );
}
