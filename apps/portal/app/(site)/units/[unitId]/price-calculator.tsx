'use client';

import { useMemo, useState } from 'react';
import {
  DOWN_PAYMENT_TIERS,
  FINANCING_OPTIONS,
  Money,
  PAYMENT_TERMS,
  PricingService,
  type DownPaymentTier,
  type FinancingOption,
  type PaymentTerm,
} from '@sfsr/domain';

/**
 * Live payment computation on the unit page.
 *
 * This runs the REAL `PricingService` — the same class the Billing department
 * uses to raise a Statement of Account, imported straight from @sfsr/domain.
 * That is possible because the domain package is pure TypeScript with zero
 * runtime dependencies (§5.5): it runs in a browser as happily as on a server.
 *
 * The practical consequence is that a buyer cannot be quoted a figure that
 * Billing later disagrees with. There is no second implementation to drift
 * (§3.1, Single Source of Truth) — and no server round trip either, so
 * dragging the term slider costs zero Firestore reads.
 */

const pricing = new PricingService();

export function PriceCalculator({
  unitPriceCentavos,
  parkingPriceCentavos,
  reservationFeeCentavos,
}: {
  unitPriceCentavos: number;
  parkingPriceCentavos: number;
  reservationFeeCentavos: number;
}) {
  const [tier, setTier] = useState<DownPaymentTier>(20);
  const [term, setTerm] = useState<PaymentTerm>(24);
  const [financing, setFinancing] = useState<FinancingOption>('Bank Financing');
  const [withParking, setWithParking] = useState(false);

  const summary = useMemo(() => {
    try {
      return pricing.computeSummary({
        unitPrice: Money.fromCentavos(unitPriceCentavos),
        parkingPrice: withParking ? Money.fromCentavos(parkingPriceCentavos) : undefined,
        downPaymentTier: tier,
        paymentTerm: term,
        reservationFee: Money.fromCentavos(reservationFeeCentavos),
      });
    } catch {
      // The engine throws when fee + discount would exceed the down payment.
      // Cannot happen for the seeded inventory, but the UI must not blank out.
      return null;
    }
  }, [unitPriceCentavos, parkingPriceCentavos, reservationFeeCentavos, tier, term, withParking]);

  const select =
    'mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-800';

  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
        Sample computation
      </h2>

      <div className="grid gap-4 border-b border-neutral-200 p-5 sm:grid-cols-2 dark:border-neutral-800">
        <label className="block text-sm">
          <span className="font-medium">Down payment</span>
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value) as DownPaymentTier)}
            className={select}
          >
            {DOWN_PAYMENT_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Payment term</span>
          <select
            value={String(term)}
            onChange={(e) => {
              const value = e.target.value;
              setTerm(value === 'Spot Cash' ? 'Spot Cash' : (Number(value) as PaymentTerm));
            }}
            className={select}
          >
            {PAYMENT_TERMS.map((t) => (
              <option key={String(t)} value={String(t)}>
                {t === 'Spot Cash' ? 'Spot Cash' : `${t} months`}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Balance financing</span>
          <select
            value={financing}
            onChange={(e) => setFinancing(e.target.value as FinancingOption)}
            className={select}
          >
            {FINANCING_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        {parkingPriceCentavos > 0 ? (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={withParking}
              onChange={(e) => setWithParking(e.target.checked)}
              className="rounded border-neutral-300"
            />
            <span>
              With parking
              <span className="ml-1 text-neutral-500">
                ({Money.fromCentavos(parkingPriceCentavos).format()})
              </span>
            </span>
          </label>
        ) : null}
      </div>

      {summary ? (
        <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          <Row label="Total purchase price" value={summary.totalPurchasePrice} strong />
          <Row label={`Down payment (${tier}%)`} value={summary.downPayment} />
          <Row label="Less: reservation fee" value={summary.reservationFee} negative />
          <Row
            label={`Less: promotional discount`}
            hint={summary.promotionalDiscount.isZero() ? undefined : summary.discountDescription}
            value={summary.promotionalDiscount}
            negative
          />
          <Row label="Net down payment required" value={summary.netDownPaymentRequired} strong />
          <Row
            label={term === 'Spot Cash' ? 'Payable in full' : `Monthly (${term} months)`}
            value={summary.monthlyDownPayment}
          />
          <Row
            label={`Balance — ${financing}`}
            value={summary.balanceOnTotalPurchasePrice}
            strong
          />
        </dl>
      ) : (
        <p className="p-5 text-sm text-neutral-500">
          This combination is not available for this unit.
        </p>
      )}

      <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400 dark:border-neutral-800">
        Computed by the same pricing engine St. Francis Square Realty uses to issue Statements of
        Account. Indicative only — the binding figures are those on your approved reservation.
      </p>
    </section>
  );
}

function Row({
  label,
  hint,
  value,
  strong,
  negative,
}: {
  label: string;
  hint?: string;
  value: Money;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className={strong ? 'font-medium' : 'text-neutral-600 dark:text-neutral-400'}>
        {label}
        {hint ? <span className="ml-1 text-xs text-neutral-400">({hint})</span> : null}
      </dt>
      <dd className={`tabular ${strong ? 'font-semibold' : ''}`}>
        {negative && !value.isZero() ? `(${value.format()})` : value.format()}
      </dd>
    </div>
  );
}
