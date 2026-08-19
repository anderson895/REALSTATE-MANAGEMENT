'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Money, PricingService, type DiscountBase, type DiscountSchedule } from '@sfsr/domain';
import { BusyOverlay, cn } from '@sfsr/ui';
import { updateDiscountSchedule } from './actions';

/**
 * The discount rates, with the consequence of each one shown beside it.
 *
 * ── Why a worked example sits under every row ────────────────────────────
 *
 * These are percentages of seven-figure sums. "10" and "1.0" look almost
 * identical in a narrow box, and the difference on Emerald Park's cheapest
 * Studio is ₱540,000 — repeated across every buyer who takes that tier until
 * somebody notices. So each row prices a real unit live as it is typed, using
 * the same `PricingService` the reservation form uses. A slipped decimal stops
 * being a number and becomes a peso figure that is obviously wrong.
 *
 * The sample price is fixed and labelled as a sample. Making it configurable
 * would be one more thing to get wrong on a screen whose whole job is to make
 * one number hard to get wrong.
 */

/** Emerald Park's cheapest Studio — a real unit, so the figures are familiar. */
const SAMPLE_PRICE = Money.fromPesos(6_000_000);

const BASE_LABELS: Record<DiscountBase, string> = {
  none: 'No discount',
  downPayment: 'of the down payment',
  purchasePrice: 'of the total purchase price',
};

interface Row {
  tier: number;
  rate: string;
  base: DiscountBase;
}

export function DiscountForm({
  schedule,
  canEdit,
  isDefault,
  updatedBy,
  updatedAt,
}: {
  schedule: DiscountSchedule;
  canEdit: boolean;
  isDefault: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    [...schedule]
      .sort((a, b) => a.tier - b.tier)
      .map((rule) => ({ tier: rule.tier, rate: String(rule.rate), base: rule.base })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const dirty = useMemo(
    () =>
      rows.some((row) => {
        const original = schedule.find((rule) => rule.tier === row.tier);
        return !original || String(original.rate) !== row.rate || original.base !== row.base;
      }),
    [rows, schedule],
  );

  /*
   * Priced with the SAME service the reservation form uses, not a formula
   * copied into this component. A second implementation of the discount
   * arithmetic here is one that could agree with the wizard today and disagree
   * after somebody edits one of them.
   */
  const preview = useMemo(() => {
    return rows.map((row) => {
      const rate = Number(row.rate);
      if (!Number.isFinite(rate) || row.rate.trim() === '') return null;
      try {
        const pricing = new PricingService([
          { tier: row.tier as never, rate, base: row.base },
        ]);
        return pricing.computeSummary({
          unitPrice: SAMPLE_PRICE,
          downPaymentTier: row.tier as never,
          paymentTerm: 'Spot Cash',
          reservationFee: Money.fromPesos(50_000),
        }).promotionalDiscount;
      } catch {
        // A rate that makes the deductions exceed the down payment throws from
        // the service. That IS the answer worth showing, so the row says so
        // rather than the page failing.
        return 'invalid' as const;
      }
    });
  }, [rows]);

  function setRow(tier: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.tier === tier ? { ...row, ...patch } : row)),
    );
    setError(null);
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const result = await updateDiscountSchedule(
        rows.map((row) => ({ tier: row.tier, rate: row.rate, base: row.base })),
      );
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Discount rates saved', {
        description: 'New reservations will use these. Existing ones keep their own rate.',
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BusyOverlay show={busy} label="Saving discount rates…" />

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Promotional discount by down payment tier
          </h2>
          <span className="text-[11px] text-neutral-500">
            {isDefault
              ? 'Never edited — showing the rates from RESERVATION.doc'
              : `Last changed by ${updatedBy ?? 'unknown'}${updatedAt ? ` · ${updatedAt}` : ''}`}
          </span>
        </header>

        <ul className="divide-y divide-neutral-100">
          {rows.map((row, index) => {
            const shown = preview[index];
            return (
              <li key={row.tier} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="tabular w-24 shrink-0 text-sm font-semibold text-navy-700">
                  {row.tier}% down
                </span>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    value={row.rate}
                    disabled={!canEdit}
                    onChange={(event) => setRow(row.tier, { rate: event.target.value })}
                    aria-label={`Discount rate for the ${row.tier}% down payment tier`}
                    className="tabular w-24 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 disabled:bg-neutral-50 disabled:text-neutral-500"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>

                <select
                  value={row.base}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRow(row.tier, { base: event.target.value as DiscountBase })
                  }
                  aria-label={`What the ${row.tier}% tier discount applies to`}
                  className="min-w-[15rem] flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 disabled:bg-neutral-50 disabled:text-neutral-500"
                >
                  {(Object.keys(BASE_LABELS) as DiscountBase[]).map((base) => (
                    <option key={base} value={base}>
                      {BASE_LABELS[base]}
                    </option>
                  ))}
                </select>

                {/* The number as money — see the note at the top of this file. */}
                <span
                  className={cn(
                    'tabular shrink-0 text-right text-xs',
                    shown === 'invalid' ? 'font-semibold text-rose-600' : 'text-neutral-500',
                  )}
                >
                  {shown == null
                    ? '—'
                    : shown === 'invalid'
                      ? 'Too large for this unit'
                      : `${shown.format()} off a ${SAMPLE_PRICE.format()} unit`}
                </span>
              </li>
            );
          })}
        </ul>

        {canEdit ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/80 bg-neutral-50/60 px-5 py-3.5">
            <p className="max-w-md text-[11px] leading-relaxed text-neutral-500">
              Applies to reservations submitted after saving. Anything already submitted keeps the
              rate it was sold under, and the change is recorded in the audit trail against your
              account.
            </p>
            <div className="flex items-center gap-2">
              {dirty ? (
                <button
                  type="button"
                  onClick={() => {
                    setRows(
                      [...schedule]
                        .sort((a, b) => a.tier - b.tier)
                        .map((rule) => ({
                          tier: rule.tier,
                          rate: String(rule.rate),
                          base: rule.base,
                        })),
                    );
                    setError(null);
                  }}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:border-navy-300"
                >
                  Discard changes
                </button>
              ) : null}
              <button
                type="button"
                onClick={save}
                disabled={!dirty || busy}
                className="rounded-md bg-navy-800 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save discount rates
              </button>
            </div>
          </footer>
        ) : null}

        {error ? (
          <p className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs leading-relaxed text-rose-700">
            {error}
          </p>
        ) : null}
      </section>
    </>
  );
}
