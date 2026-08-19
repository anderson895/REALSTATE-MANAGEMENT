import { Money } from '../value-objects/money';
import { InvalidValueError } from '../errors';
import {
  DEFAULT_DISCOUNT_SCHEDULE,
  DiscountStrategyFactory,
  type DiscountSchedule,
  type DownPaymentTier,
} from './discount-strategy';

/**
 * Instalment terms offered for the down payment.
 * Source: RESERVATION.doc, "Down Payment Installment".
 */
export const PAYMENT_TERMS = ['Spot Cash', 6, 12, 18, 24, 30, 36] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const FINANCING_OPTIONS = ['Bank Financing', 'PAG-IBIG Fund', 'Cash Payment'] as const;
export type FinancingOption = (typeof FINANCING_OPTIONS)[number];

export interface PricingInput {
  readonly unitPrice: Money;
  readonly parkingPrice?: Money;
  readonly downPaymentTier: DownPaymentTier;
  readonly paymentTerm: PaymentTerm;
  readonly reservationFee: Money;
}

/**
 * The figures rendered in "STEP 3 – PAYMENT SUMMARY", in the same order the
 * form presents them.
 */
export interface PaymentSummary {
  readonly totalPurchasePrice: Money;
  readonly downPayment: Money;
  readonly reservationFee: Money;
  readonly promotionalDiscount: Money;
  readonly discountDescription: string;
  readonly netDownPaymentRequired: Money;
  /**
   * The advertised monthly figure — net down payment ÷ term, rounded to the
   * nearest centavo. This is what "Monthly Down Payment" shows on the form.
   * It may differ from any individual entry in `instalments` by one centavo.
   */
  readonly monthlyDownPayment: Money;
  /**
   * The exact schedule. Guaranteed to sum to `netDownPaymentRequired` with no
   * entry differing from another by more than one centavo. Use this — never
   * `monthlyDownPayment × term` — when generating the SOA.
   */
  readonly instalments: readonly Money[];
  readonly balanceOnTotalPurchasePrice: Money;
}

/**
 * The single source of truth for every peso figure in SFSR-REMS.
 *
 * The portal wizard, the internal verification screen, the Statement of
 * Account and the PDF export all call this service. A discount shown to a
 * buyer that disagrees with what Billing computes is a contractual dispute,
 * not a bug (Development Plan.md §3.1).
 *
 * Deterministic: no I/O, no clock, no randomness — so every rule is directly
 * unit-testable.
 */
export class PricingService {
  /**
   * The discount rules this instance prices with.
   *
   * Defaults to RESERVATION.doc's, so `new PricingService()` behaves exactly as
   * it always did. Documentation's saved schedule is passed in by whatever has
   * already read it.
   *
   * A constructor argument rather than a lookup inside `computeSummary`,
   * because this class runs in the BROWSER: the reservation wizard recomputes
   * on every keystroke with no server round trip, and that only works while the
   * service stays free of I/O.
   */
  constructor(private readonly schedule: DiscountSchedule = DEFAULT_DISCOUNT_SCHEDULE) {}

  /** Unit price + parking price, per "PURCHASE PRICE" in the reservation form. */
  totalPurchasePrice(unitPrice: Money, parkingPrice?: Money): Money {
    return parkingPrice ? unitPrice.add(parkingPrice) : unitPrice;
  }

  computeSummary(input: PricingInput): PaymentSummary {
    const totalPurchasePrice = this.totalPurchasePrice(input.unitPrice, input.parkingPrice);
    const downPayment = totalPurchasePrice.percentage(input.downPaymentTier);

    const strategy = DiscountStrategyFactory.forTier(input.downPaymentTier, this.schedule);
    const promotionalDiscount = strategy.calculate(totalPurchasePrice, downPayment);

    const deductions = input.reservationFee.add(promotionalDiscount);
    if (deductions.isGreaterThan(downPayment)) {
      // Cannot occur for the seeded inventory (cheapest unit is ₱6,000,000),
      // but a future low-priced unit would otherwise produce a negative
      // schedule. Fail loudly rather than silently.
      throw new InvalidValueError(
        `Reservation fee (${input.reservationFee.format()}) plus discount ` +
          `(${promotionalDiscount.format()}) exceeds the down payment ` +
          `(${downPayment.format()}). Review the pricing for this unit.`,
      );
    }

    const netDownPaymentRequired = downPayment.subtract(deductions);
    const months = input.paymentTerm === 'Spot Cash' ? 1 : input.paymentTerm;
    const instalments = netDownPaymentRequired.divideIntoInstalments(months);

    // The advertised figure is the plain rounded quotient, which is what the
    // reservation form shows. The exact schedule above is what the SOA bills.
    const monthlyDownPayment = Money.fromCentavos(
      Math.round(netDownPaymentRequired.toCentavos() / months),
    );

    return {
      totalPurchasePrice,
      downPayment,
      reservationFee: input.reservationFee,
      promotionalDiscount,
      discountDescription: strategy.description,
      netDownPaymentRequired,
      monthlyDownPayment,
      instalments,
      balanceOnTotalPurchasePrice: totalPurchasePrice.subtract(downPayment),
    };
  }
}

/** Shared stateless instance — the service holds no mutable state. */
export const pricingService = new PricingService();
