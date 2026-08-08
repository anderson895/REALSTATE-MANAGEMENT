import type { ReservationStatus } from '@sfsr/domain';
import { cn } from '@sfsr/ui';
import { STAGE_LABELS, STATUS_LABELS, isOffTrack, stageRank } from '@/lib/reservations';

/**
 * Reservation status, coloured by what it asks of the reader.
 *
 * Not the shared `StatusBadge` from @sfsr/ui: that one is keyed to unit
 * statuses (Available / On Hold / Sold) and renders everything else grey, so a
 * queue of reservations came out as nine identical grey pills. The Portal
 * translates these same statuses into buyer-facing wording before it renders,
 * which is why this stays here rather than moving into the shared package.
 */
const TONES: Record<ReservationStatus, string> = {
  // Waiting on staff — neutral, it is simply in the queue.
  PendingPaymentVerification: 'bg-neutral-100 text-neutral-700 ring-neutral-500/20',
  // Moving — progress made, more to do.
  PaymentVerified: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  DocumentsVerified: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  // Settled favourably.
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ContractSigned: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  // Needs someone to act, and the clock is running.
  DeficiencyNoted: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  // Dead ends.
  Expired: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Cancelled: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={cn(
        // whitespace-nowrap: the longest label, "Awaiting payment check", wraps
        // to three lines in a narrow table column and the pill stops looking
        // like a pill. The column scrolls instead.
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[status] ?? TONES.PendingPaymentVerification,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * Where this application sits in the four-stage lifecycle.
 *
 * Answers the question a reviewer opens the record with — "what has already
 * been checked, and by implication what is mine to check" — without making
 * them infer it from a single status word.
 */
export function LifecycleStepper({ status }: { status: ReservationStatus }) {
  const rank = stageRank(status);
  const derailed = isOffTrack(status);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STAGE_LABELS.map((label, index) => {
        const done = index <= rank;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                done && !derailed
                  ? 'bg-navy-800 text-white'
                  : done
                    ? 'bg-amber-500 text-white'
                    : 'bg-neutral-200 text-neutral-500',
              )}
            >
              {done ? '✓' : index + 1}
            </span>
            <span
              className={cn(
                'text-xs',
                done ? 'font-medium text-neutral-700' : 'text-neutral-400',
              )}
            >
              {label}
            </span>
            {index < STAGE_LABELS.length - 1 ? (
              <span aria-hidden="true" className="mx-1 h-px w-6 bg-neutral-200 " />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
