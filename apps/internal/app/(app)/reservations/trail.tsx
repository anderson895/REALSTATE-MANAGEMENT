import { BadgeCheck, Banknote, FileCheck2, type LucideIcon } from 'lucide-react';
import type { ReservationRow } from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { formatDate } from '@/lib/reservations';

/**
 * Who did what to this reservation, and when.
 *
 * note.txt: "Audit trail — ilologs kung sinong staff ang nag verify, at kung
 * sinong super visor ang nag approve."
 *
 * The `auditLogs` collection already holds all three events, but it is
 * append-only, unindexed by reservation, and written for after-the-fact
 * inspection. This is the same facts read straight off the record, for the
 * person deciding what to do next — a supervisor about to sign needs to see
 * that Billing has cleared the payment without going to look for the log.
 *
 * The three steps are shown in the order they must complete, and an unfinished
 * one is drawn as an outline rather than hidden. A trail that shows only what
 * has happened cannot tell you what is missing, which is the question actually
 * being asked.
 */

interface Step {
  readonly key: string;
  readonly label: string;
  readonly desk: string;
  readonly icon: LucideIcon;
  readonly by: string | null;
  readonly at: string | null;
}

export function VerificationTrail({
  reservation,
  names,
}: {
  reservation: ReservationRow;
  /** Employee id -> full name. Resolved once by the page, not per row. */
  names: Map<string, string>;
}) {
  const steps: Step[] = [
    {
      key: 'payment',
      label: 'Payment verified',
      desk: 'Billing',
      icon: Banknote,
      by: reservation.paymentVerifiedBy,
      at: reservation.paymentVerifiedAt,
    },
    {
      key: 'documents',
      label: 'Requirements verified',
      desk: 'Documentation',
      icon: FileCheck2,
      by: reservation.documentsVerifiedBy,
      at: reservation.documentsVerifiedAt,
    },
    {
      key: 'approved',
      label: 'Final approval',
      desk: 'Documentation Supervisor',
      icon: BadgeCheck,
      by: reservation.approvedBy,
      at: reservation.approvedAt,
    },
  ];

  const outstanding = steps.filter((s) => !s.by).length;

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Verification Trail
        </h2>
        <span className="text-[11px] font-medium text-neutral-500">
          {outstanding === 0 ? 'complete' : `${outstanding} outstanding`}
        </span>
      </header>

      <ol className="divide-y divide-neutral-100">
        {steps.map((step) => {
          const done = step.by !== null;
          const Icon = step.icon;

          return (
            <li key={step.key} className="flex items-start gap-3 px-5 py-3.5">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  done
                    ? 'bg-emerald-500 text-white'
                    : 'border border-dashed border-neutral-300 text-neutral-300',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} />
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    done ? 'text-neutral-800' : 'text-neutral-400',
                  )}
                >
                  {step.label}
                </p>

                {done ? (
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {/* The name if it resolves, the id if it does not — a
                        deleted account must not read as "nobody did this". */}
                    <span className="font-medium text-navy-700">
                      {names.get(step.by!) ?? step.by}
                    </span>
                    {' · '}
                    {formatDate(step.at)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-neutral-400">Waiting on {step.desk}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {outstanding > 0 ? (
        <p className="border-t border-neutral-200/80 px-5 py-3 text-[11px] leading-relaxed text-neutral-500">
          Payment and requirements are verified independently and in any order. Final approval is
          refused until both are done.
        </p>
      ) : null}
    </section>
  );
}
