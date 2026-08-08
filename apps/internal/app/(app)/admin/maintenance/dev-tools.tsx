'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { ConfirmDialog } from '@sfsr/ui';
import { resetReservations } from './actions';
import type { ResetCounts } from '@/lib/dev-reset';

/**
 * Development-only reset panel.
 *
 * ── Why it looks like this ────────────────────────────────────────────────
 *
 * Dashed rather than solid, so nobody mistakes it for part of the product on a
 * screen share.
 *
 * It states the counts BEFORE the confirmation rather than after. "Delete all
 * reservations?" is a question about an abstraction; "this removes 3
 * reservations, 3 payments and 7 audit entries, and releases 1 held unit" is a
 * question about the database in front of you.
 *
 * The panel not rendering in production is a convenience, not the control —
 * `resetReservations` re-checks NODE_ENV server-side, because a server action
 * is a public endpoint whether or not a button points at it.
 */
export function DevTools({ counts }: { counts: ResetCounts }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const total =
    counts.reservations + counts.payments + counts.documents + counts.auditLogs + counts.counters;
  const holds = counts.heldUnits + counts.heldParking;

  function run() {
    startTransition(async () => {
      const response = await resetReservations();
      if (!response.ok) {
        setResult(response.error ?? 'Reset failed.');
        return;
      }
      const c = response.counts!;
      setResult(
        `Cleared ${c.reservations} reservations, ${c.payments} payments, ${c.documents} documents, ` +
          `${c.auditLogs} audit entries. Released ${c.heldUnits + c.heldParking} holds.`,
      );
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-dashed border-amber-400 bg-white p-5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Development only
      </p>

      <dl className="mt-4 max-w-sm space-y-1.5 text-xs">
        <Row label="Reservations" value={counts.reservations} />
        <Row label="Payments" value={counts.payments} />
        <Row label="Documents" value={counts.documents} />
        <Row label="Audit entries" value={counts.auditLogs} />
        <Row label="Counters" value={counts.counters} />
        <Row label="Held units / parking" value={holds} />
      </dl>

      {result ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900">
          {result}
        </p>
      ) : null}

      <div className="mt-4 max-w-sm">
        <ConfirmDialog
          title="Clear all reservation data?"
          points={[
            `${counts.reservations} reservations, ${counts.payments} payments and ${counts.documents} documents are deleted.`,
            `${counts.auditLogs} audit entries go too — the counter resets, and a reused reservation number must not share a trail with an older one.`,
            `${holds} held unit${holds === 1 ? '' : 's'} and parking slot${holds === 1 ? '' : 's'} return to Available.`,
            'Seeded projects, units, employees and client accounts are left alone.',
          ]}
          footnote="Development database only. This is refused in a production build."
          confirmLabel={pending ? 'Clearing…' : 'Clear everything'}
          tone="danger"
          onConfirm={run}
          trigger={
            <button
              type="button"
              disabled={pending || total + holds === 0}
              className="w-full rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {total + holds === 0 ? 'Nothing to clear' : 'Clear reservation data'}
            </button>
          }
        />
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`tabular font-semibold ${value > 0 ? 'text-navy-800' : 'text-neutral-300'}`}>
        {value}
      </dd>
    </div>
  );
}
