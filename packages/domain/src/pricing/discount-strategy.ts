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
 * Resolves a tier to its strategy.
 *
 * Adding a tier — say 60% — is one entry here plus one new strategy class if
 * the base differs. No existing branch is edited (Open/Closed, §3.10).
 */
export class DiscountStrategyFactory {
  private static readonly byTier: ReadonlyMap<DownPaymentTier, DiscountStrategy> = new Map([
    [10, new NoDiscount()],
    [20, new DownPaymentBasedDiscount(10)],
    [30, new PurchasePriceBasedDiscount(5)],
    [40, new PurchasePriceBasedDiscount(10)],
    [50, new PurchasePriceBasedDiscount(10)],
  ] as ReadonlyArray<readonly [DownPaymentTier, DiscountStrategy]>);

  static forTier(tier: number): DiscountStrategy {
    if (!isDownPaymentTier(tier)) {
      throw new InvalidValueError(
        `Unsupported down payment tier: ${tier}%. Allowed: ${DOWN_PAYMENT_TIERS.join(', ')}.`,
      );
    }
    const strategy = DiscountStrategyFactory.byTier.get(tier);
    if (!strategy) {
      throw new InvalidValueError(`No discount strategy registered for tier ${tier}%.`);
    }
    return strategy;
  }
}
