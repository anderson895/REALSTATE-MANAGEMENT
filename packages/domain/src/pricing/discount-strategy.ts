import { Money } from '../value-objects/money';
import { InvalidValueError } from '../errors';

/**
 * The five down-payment tiers offered on the reservation form.
 * Source: RESERVATION.doc, "STEP 2 – PAYMENT TERMS".
 */
export const DOWN_PAYMENT_TIERS = [10, 20, 30, 40, 50] as const;
export type DownPaymentTier = (typeof DOWN_PAYMENT_TIERS)[number];

export function isDownPaymentTier(value: number): value is DownPaymentTier {
  return (DOWN_PAYMENT_TIERS as readonly number[]).includes(value);
}

/**
 * Promotional discount rule for one down-payment tier.
 *
 * Modelled as a class hierarchy rather than a `switch` because the rule's
 * *base* changes between tiers — the 20% tier discounts the down payment,
 * the 30–50% tiers discount the total purchase price. A conditional would
 * bury that distinction; separate strategies make it the first thing a
 * reader sees.
 *
 * Source: RESERVATION.doc — "Discount amount – if 40% to 50% downpayment –
 * 10% discount of total purchase price / If 30% downpayment – 5% discount of
 * total purchase price / If 20% downpayment – 10% of the downpayment /
 * If 10% downpayment – no discount".
 *
 * See Development Plan.md §3.9 and §8.3.
 */
export abstract class DiscountStrategy {
  /** Human-readable rule, shown in the payment summary and the SOA. */
  abstract readonly description: string;

  abstract calculate(totalPurchasePrice: Money, downPayment: Money): Money;
}

/** 10% down payment — no promotional discount. */
class NoDiscount extends DiscountStrategy {
  override readonly description = 'No promotional discount';

  override calculate(): Money {
    return Money.zero();
  }
}

/** 20% down payment — the discount is a percentage OF THE DOWN PAYMENT. */
class DownPaymentBasedDiscount extends DiscountStrategy {
  override readonly description: string;

  constructor(private readonly rate: number) {
    super();
    this.description = `${rate}% of the down payment`;
  }

  override calculate(_totalPurchasePrice: Money, downPayment: Money): Money {
    return downPayment.percentage(this.rate);
  }
}

/** 30–50% down payment — the discount is a percentage OF THE TOTAL PRICE. */
class PurchasePriceBasedDiscount extends DiscountStrategy {
  override readonly description: string;

  constructor(private readonly rate: number) {
    super();
    this.description = `${rate}% of the total purchase price`;
  }

  override calculate(totalPurchasePrice: Money): Money {
    return totalPurchasePrice.percentage(this.rate);
  }
}

/**
 * What a discount is a percentage OF.
 *
 * The distinction the strategy classes above exist for, named so it can be
 * stored and edited rather than only compiled: the 20% tier discounts the down
 * payment, the 30–50% tiers discount the whole purchase price. Getting these
 * two confused on a ₱11M unit is a six-figure mistake, which is why the editing
 * screen names the base in words beside every rate.
 */
export const DISCOUNT_BASES = ['none', 'downPayment', 'purchasePrice'] as const;
export type DiscountBase = (typeof DISCOUNT_BASES)[number];

/** One tier's rule. `rate` is a percentage: 10 means 10%. */
export interface DiscountRule {
  readonly tier: DownPaymentTier;
  readonly rate: number;
  readonly base: DiscountBase;
}

export type DiscountSchedule = readonly DiscountRule[];

/**
 * The rules as RESERVATION.doc states them.
 *
 * "Discount amount – if 40% to 50% downpayment – 10% discount of total purchase
 * price / If 30% downpayment – 5% discount of total purchase price / If 20%
 * downpayment – 10% of the downpayment / If 10% downpayment – no discount".
 *
 * These used to be the only possible answer — a static Map compiled into the
 * bundle. comments.doc moved them: "Pag may revision sa discount or special
 * discount promo need sya iedit sa internal, ang incharge sa pagpalit ng
 * discount is Documentation." So they are now a DEFAULT, used when nothing has
 * been saved, and the shape a saved schedule has to satisfy.
 *
 * Kept here rather than seeded into Firestore so the system still prices
 * correctly on a database that has never been configured — a fresh install, a
 * failed read, a settings document someone deleted. Pricing must not have a
 * state in which it cannot answer.
 */
export const DEFAULT_DISCOUNT_SCHEDULE: DiscountSchedule = [
  { tier: 10, rate: 0, base: 'none' },
  { tier: 20, rate: 10, base: 'downPayment' },
  { tier: 30, rate: 5, base: 'purchasePrice' },
  { tier: 40, rate: 10, base: 'purchasePrice' },
  { tier: 50, rate: 10, base: 'purchasePrice' },
];

/** Builds the strategy a rule describes. */
function strategyFor(rule: DiscountRule): DiscountStrategy {
  if (rule.base === 'none' || rule.rate === 0) return new NoDiscount();
  return rule.base === 'downPayment'
    ? new DownPaymentBasedDiscount(rule.rate)
    : new PurchasePriceBasedDiscount(rule.rate);
}

/**
 * Rejects a schedule that would misprice a sale.
 *
 * Returns the problems rather than throwing, because the caller is a form and a
 * list of what is wrong beats the first thing that was wrong. The action saving
 * it runs this too — a browser is where the typing happens, not where the
 * checking counts.
 */
export function validateDiscountSchedule(schedule: DiscountSchedule): string[] {
  const problems: string[] = [];

  for (const tier of DOWN_PAYMENT_TIERS) {
    const matches = schedule.filter((rule) => rule.tier === tier);
    if (matches.length === 0) problems.push(`The ${tier}% down payment tier is missing.`);
    if (matches.length > 1) problems.push(`The ${tier}% down payment tier is listed twice.`);
  }

  for (const rule of schedule) {
    const where = `${rule.tier}% tier`;
    if (!isDownPaymentTier(rule.tier)) {
      problems.push(`${rule.tier}% is not one of the offered down payment tiers.`);
    }
    if (!Number.isFinite(rule.rate)) {
      problems.push(`${where}: the discount must be a number.`);
      continue;
    }
    if (rule.rate < 0) problems.push(`${where}: a discount cannot be negative.`);
    // 100% of the purchase price is a free unit. There is no arithmetic reason
    // to stop below it, and inventing a lower ceiling would be this file
    // deciding a commercial question it was not asked.
    if (rule.rate > 100) problems.push(`${where}: a discount cannot exceed 100%.`);
    if (Math.round(rule.rate * 100) !== rule.rate * 100) {
      problems.push(`${where}: use at most two decimal places.`);
    }
    if (!(DISCOUNT_BASES as readonly string[]).includes(rule.base)) {
      problems.push(`${where}: "${rule.base}" is not a discount base.`);
    }
  }

  return problems;
}

/**
 * Resolves a tier to its strategy, under a given schedule.
 *
 * The schedule defaults, so every existing caller keeps working and a page that
 * does not care about configuration does not have to thread one through.
 */
export class DiscountStrategyFactory {
  static forTier(
    tier: number,
    schedule: DiscountSchedule = DEFAULT_DISCOUNT_SCHEDULE,
  ): DiscountStrategy {
    if (!isDownPaymentTier(tier)) {
      throw new InvalidValueError(
        `Unsupported down payment tier: ${tier}%. Allowed: ${DOWN_PAYMENT_TIERS.join(', ')}.`,
      );
    }

    const rule = schedule.find((entry) => entry.tier === tier);
    if (!rule) {
      /*
       * Falls back to the documented rule rather than throwing.
       *
       * A saved schedule missing a tier is a configuration fault, and the
       * alternative is a reservation form that shows an error instead of a
       * price. RESERVATION.doc's own numbers are a defensible answer; a blank
       * screen is not, and Documentation would find out from a buyer.
       */
      const fallback = DEFAULT_DISCOUNT_SCHEDULE.find((entry) => entry.tier === tier);
      if (!fallback) throw new InvalidValueError(`No discount rule for tier ${tier}%.`);
      return strategyFor(fallback);
    }

    return strategyFor(rule);
  }
}
