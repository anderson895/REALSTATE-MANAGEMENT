import { describe, expect, it } from 'vitest';
import { Money } from '../value-objects/money';
import { InvalidValueError } from '../errors';
import { PricingService, PAYMENT_TERMS, type PaymentTerm } from './pricing.service';
import {
  DEFAULT_DISCOUNT_SCHEDULE,
  DiscountStrategyFactory,
  DOWN_PAYMENT_TIERS,
  validateDiscountSchedule,
  type DiscountSchedule,
  type DownPaymentTier,
} from './discount-strategy';

const pricing = new PricingService();
const RESERVATION_FEE = Money.fromPesos(50_000);
const TPP = Money.fromPesos(10_000_000);

describe('DiscountStrategyFactory — the tiers from RESERVATION.doc', () => {
  it('gives no discount at 10%', () => {
    const d = DiscountStrategyFactory.forTier(10).calculate(TPP, TPP.percentage(10));
    expect(d.isZero()).toBe(true);
  });

  it('discounts 10% OF THE DOWN PAYMENT at the 20% tier', () => {
    const dp = TPP.percentage(20); // ₱2,000,000
    const d = DiscountStrategyFactory.forTier(20).calculate(TPP, dp);
    expect(d.toPesos()).toBe(200_000); // not ₱1,000,000
  });

  it('discounts 5% OF THE TOTAL PRICE at the 30% tier', () => {
    const d = DiscountStrategyFactory.forTier(30).calculate(TPP, TPP.percentage(30));
    expect(d.toPesos()).toBe(500_000);
  });

  it('discounts 10% OF THE TOTAL PRICE at the 40% and 50% tiers', () => {
    expect(DiscountStrategyFactory.forTier(40).calculate(TPP, TPP.percentage(40)).toPesos()).toBe(
      1_000_000,
    );
    expect(DiscountStrategyFactory.forTier(50).calculate(TPP, TPP.percentage(50)).toPesos()).toBe(
      1_000_000,
    );
  });

  it('rejects an unsupported tier', () => {
    expect(() => DiscountStrategyFactory.forTier(60)).toThrow(InvalidValueError);
    expect(() => DiscountStrategyFactory.forTier(25)).toThrow(InvalidValueError);
  });

  it('never penalises a buyer for paying more', () => {
    const discounts = DOWN_PAYMENT_TIERS.map((tier) =>
      DiscountStrategyFactory.forTier(tier).calculate(TPP, TPP.percentage(tier)).toCentavos(),
    );
    for (let i = 1; i < discounts.length; i++) {
      expect(discounts[i]!).toBeGreaterThanOrEqual(discounts[i - 1]!);
    }
  });
});

describe('PricingService — the worked example in Development Plan.md §8.3', () => {
  // ₱10,000,000 total purchase price, 24-month term.
  const expected = [
    { tier: 10, downPayment: 1_000_000, discount: 0, net: 950_000, monthly: 39_583.33, balance: 9_000_000 },
    { tier: 20, downPayment: 2_000_000, discount: 200_000, net: 1_750_000, monthly: 72_916.67, balance: 8_000_000 },
    { tier: 30, downPayment: 3_000_000, discount: 500_000, net: 2_450_000, monthly: 102_083.33, balance: 7_000_000 },
    { tier: 40, downPayment: 4_000_000, discount: 1_000_000, net: 2_950_000, monthly: 122_916.67, balance: 6_000_000 },
    { tier: 50, downPayment: 5_000_000, discount: 1_000_000, net: 3_950_000, monthly: 164_583.33, balance: 5_000_000 },
  ] as const;

  it.each(expected)(
    'matches the published table at the $tier% tier',
    ({ tier, downPayment, discount, net, monthly, balance }) => {
      const s = pricing.computeSummary({
        unitPrice: TPP,
        downPaymentTier: tier,
        paymentTerm: 24,
        reservationFee: RESERVATION_FEE,
      });

      expect(s.totalPurchasePrice.toPesos()).toBe(10_000_000);
      expect(s.downPayment.toPesos()).toBe(downPayment);
      expect(s.promotionalDiscount.toPesos()).toBe(discount);
      expect(s.netDownPaymentRequired.toPesos()).toBe(net);
      expect(s.monthlyDownPayment.toPesos()).toBeCloseTo(monthly, 2);
      expect(s.balanceOnTotalPurchasePrice.toPesos()).toBe(balance);
    },
  );
});

describe('PricingService — schedule integrity', () => {
  it('every tier × term schedule sums back to the net down payment exactly', () => {
    for (const tier of DOWN_PAYMENT_TIERS) {
      for (const term of PAYMENT_TERMS) {
        const s = pricing.computeSummary({
          unitPrice: TPP,
          downPaymentTier: tier,
          paymentTerm: term as PaymentTerm,
          reservationFee: RESERVATION_FEE,
        });

        const sum = s.instalments.reduce((acc, m) => acc.add(m), Money.zero());
        expect(sum.toCentavos(), `${tier}% over ${String(term)}`).toBe(
          s.netDownPaymentRequired.toCentavos(),
        );
      }
    }
  });

  it('treats Spot Cash as a single payment', () => {
    const s = pricing.computeSummary({
      unitPrice: TPP,
      downPaymentTier: 30,
      paymentTerm: 'Spot Cash',
      reservationFee: RESERVATION_FEE,
    });
    expect(s.instalments).toHaveLength(1);
    expect(s.instalments[0]!.equals(s.netDownPaymentRequired)).toBe(true);
  });

  it('the advertised monthly figure is within one centavo of every instalment', () => {
    const s = pricing.computeSummary({
      unitPrice: TPP,
      downPaymentTier: 30,
      paymentTerm: 36,
      reservationFee: RESERVATION_FEE,
    });
    for (const inst of s.instalments) {
      expect(Math.abs(inst.toCentavos() - s.monthlyDownPayment.toCentavos())).toBeLessThanOrEqual(1);
    }
  });
});

describe('PricingService — parking and edge cases', () => {
  it('adds the parking price into the total purchase price', () => {
    const s = pricing.computeSummary({
      unitPrice: Money.fromPesos(6_000_000),
      parkingPrice: Money.fromPesos(600_000),
      downPaymentTier: 20,
      paymentTerm: 12,
      reservationFee: RESERVATION_FEE,
    });
    expect(s.totalPurchasePrice.toPesos()).toBe(6_600_000);
    expect(s.downPayment.toPesos()).toBe(1_320_000);
  });

  it('handles the cheapest seeded unit without going negative', () => {
    // The Legaspi Place U001 — ₱6,000,000, the lowest price in the inventory.
    const s = pricing.computeSummary({
      unitPrice: Money.fromPesos(6_000_000),
      downPaymentTier: 10,
      paymentTerm: 36,
      reservationFee: RESERVATION_FEE,
    });
    expect(s.netDownPaymentRequired.toPesos()).toBe(550_000);
  });

  it('throws when fee plus discount would exceed the down payment', () => {
    expect(() =>
      pricing.computeSummary({
        unitPrice: Money.fromPesos(100_000), // hypothetical low-priced unit
        downPaymentTier: 10,
        paymentTerm: 6,
        reservationFee: RESERVATION_FEE,
      }),
    ).toThrow(InvalidValueError);
  });
});

describe('a configurable discount schedule', () => {
  // comments.doc: "Pag may revision sa discount or special discount promo need
  // sya iedit sa internal, ang incharge sa pagpalit ng discount is
  // Documentation." These rates were compiled in until then.
  const unit = Money.fromPesos(6_000_000);

  const summaryWith = (schedule: DiscountSchedule, tier: DownPaymentTier) =>
    new PricingService(schedule).computeSummary({
      unitPrice: unit,
      downPaymentTier: tier,
      paymentTerm: 'Spot Cash',
      reservationFee: RESERVATION_FEE,
    });

  it('prices exactly as before when given no schedule', () => {
    // The guarantee that made this change safe to ship: every existing caller
    // constructs `new PricingService()` and must be unaffected.
    const before = new PricingService().computeSummary({
      unitPrice: unit,
      downPaymentTier: 40,
      paymentTerm: 'Spot Cash',
      reservationFee: RESERVATION_FEE,
    });
    expect(before.promotionalDiscount.toCentavos()).toBe(
      summaryWith(DEFAULT_DISCOUNT_SCHEDULE, 40).promotionalDiscount.toCentavos(),
    );
  });

  it('honours an edited rate', () => {
    // 40% tier moved from 10% to 7.5% of the purchase price.
    const edited = DEFAULT_DISCOUNT_SCHEDULE.map((rule) =>
      rule.tier === 40 ? { ...rule, rate: 7.5 } : rule,
    );
    expect(summaryWith(edited, 40).promotionalDiscount).toEqual(Money.fromPesos(450_000));
    // Untouched tiers must not move with it.
    expect(summaryWith(edited, 30).promotionalDiscount).toEqual(Money.fromPesos(300_000));
  });

  it('honours an edited base, which changes the answer by an order of magnitude', () => {
    // The mistake the editing screen prices out loud: 10% of a ₱6,000,000 unit
    // is ₱600,000; 10% of its 20% down payment is ₱120,000. Same "10".
    const ofPrice = DEFAULT_DISCOUNT_SCHEDULE.map((rule) =>
      rule.tier === 20 ? { ...rule, base: 'purchasePrice' as const } : rule,
    );
    expect(summaryWith(DEFAULT_DISCOUNT_SCHEDULE, 20).promotionalDiscount).toEqual(
      Money.fromPesos(120_000),
    );
    expect(summaryWith(ofPrice, 20).promotionalDiscount).toEqual(Money.fromPesos(600_000));
  });

  it('falls back to the documented rule when a tier is missing from the schedule', () => {
    // A configuration fault must not turn the reservation form into an error
    // message on a public website. RESERVATION.doc's own number is the answer.
    const missing = DEFAULT_DISCOUNT_SCHEDULE.filter((rule) => rule.tier !== 30);
    expect(summaryWith(missing, 30).promotionalDiscount).toEqual(Money.fromPesos(300_000));
  });

  it('treats a zero rate as no discount whatever the base says', () => {
    const zeroed = DEFAULT_DISCOUNT_SCHEDULE.map((rule) =>
      rule.tier === 50 ? { ...rule, rate: 0 } : rule,
    );
    const summary = summaryWith(zeroed, 50);
    expect(summary.promotionalDiscount.isZero()).toBe(true);
    expect(summary.discountDescription).toBe('No promotional discount');
  });
});

describe('validateDiscountSchedule', () => {
  it('accepts the documented schedule', () => {
    expect(validateDiscountSchedule(DEFAULT_DISCOUNT_SCHEDULE)).toEqual([]);
  });

  it('refuses a negative rate, and one above 100%', () => {
    const negative = DEFAULT_DISCOUNT_SCHEDULE.map((r) => (r.tier === 30 ? { ...r, rate: -5 } : r));
    const absurd = DEFAULT_DISCOUNT_SCHEDULE.map((r) => (r.tier === 30 ? { ...r, rate: 150 } : r));
    expect(validateDiscountSchedule(negative).join(' ')).toMatch(/negative/);
    expect(validateDiscountSchedule(absurd).join(' ')).toMatch(/exceed 100/);
  });

  it('refuses a rate with more than two decimal places', () => {
    // A rate is a published commercial term, not a float to be carried to
    // fifteen digits — and Money rounds, so the extra precision is a lie.
    const fussy = DEFAULT_DISCOUNT_SCHEDULE.map((r) => (r.tier === 30 ? { ...r, rate: 5.005 } : r));
    expect(validateDiscountSchedule(fussy).join(' ')).toMatch(/two decimal places/);
  });

  it('refuses a schedule missing a tier the form offers', () => {
    const missing = DEFAULT_DISCOUNT_SCHEDULE.filter((r) => r.tier !== 20);
    expect(validateDiscountSchedule(missing).join(' ')).toMatch(/20% down payment tier is missing/);
  });

  it('refuses a tier listed twice', () => {
    const twice = [...DEFAULT_DISCOUNT_SCHEDULE, { tier: 30 as const, rate: 99, base: 'none' as const }];
    expect(validateDiscountSchedule(twice).join(' ')).toMatch(/listed twice/);
  });

  it('refuses a rate that is not a number at all', () => {
    const nan = DEFAULT_DISCOUNT_SCHEDULE.map((r) => (r.tier === 30 ? { ...r, rate: NaN } : r));
    expect(validateDiscountSchedule(nan).join(' ')).toMatch(/must be a number/);
  });

  it('covers every tier the reservation form offers', () => {
    // The two lists are edited in different files; a tier added to
    // DOWN_PAYMENT_TIERS without a rule would price as a silent fallback.
    for (const tier of DOWN_PAYMENT_TIERS) {
      expect(
        DEFAULT_DISCOUNT_SCHEDULE.some((rule) => rule.tier === tier),
        `tier ${tier}`,
      ).toBe(true);
    }
  });
});
