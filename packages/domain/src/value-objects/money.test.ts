import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { InvalidValueError } from '../errors';

describe('Money — construction', () => {
  it('rejects fractional centavos', () => {
    expect(() => Money.fromCentavos(100.5)).toThrow(InvalidValueError);
  });

  it('rejects negative amounts', () => {
    expect(() => Money.fromCentavos(-1)).toThrow(InvalidValueError);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => Money.fromCentavos(Number.NaN)).toThrow(InvalidValueError);
    expect(() => Money.fromCentavos(Number.POSITIVE_INFINITY)).toThrow(InvalidValueError);
    expect(() => Money.fromPesos(Number.NaN)).toThrow(InvalidValueError);
  });

  it('accepts zero', () => {
    expect(Money.zero().toCentavos()).toBe(0);
    expect(Money.zero().isZero()).toBe(true);
  });

  it('converts pesos to centavos', () => {
    expect(Money.fromPesos(15_000_000).toCentavos()).toBe(1_500_000_000);
    expect(Money.fromPesos(0.01).toCentavos()).toBe(1);
  });

  it('does not lose a centavo on the classic float case', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in raw float arithmetic.
    const sum = Money.fromPesos(0.1).add(Money.fromPesos(0.2));
    expect(sum.toCentavos()).toBe(30);
    expect(sum.equals(Money.fromPesos(0.3))).toBe(true);
  });
});

describe('Money — arithmetic', () => {
  it('adds and subtracts without mutating', () => {
    const a = Money.fromPesos(100);
    const b = Money.fromPesos(30);
    expect(a.add(b).toPesos()).toBe(130);
    expect(a.subtract(b).toPesos()).toBe(70);
    expect(a.toPesos()).toBe(100); // unchanged
  });

  it('throws rather than producing a negative balance', () => {
    expect(() => Money.fromPesos(50_000).subtract(Money.fromPesos(60_000))).toThrow(
      InvalidValueError,
    );
  });

  it('computes percentages the way the discount rules expect', () => {
    const tpp = Money.fromPesos(10_000_000);
    expect(tpp.percentage(10).toPesos()).toBe(1_000_000);
    expect(tpp.percentage(5).toPesos()).toBe(500_000);
    expect(tpp.percentage(0).isZero()).toBe(true);
  });

  it('rejects negative percentages and factors', () => {
    expect(() => Money.fromPesos(100).percentage(-1)).toThrow(InvalidValueError);
    expect(() => Money.fromPesos(100).multiply(-1)).toThrow(InvalidValueError);
  });
});

describe('Money — instalment splitting', () => {
  it('rejects a non-positive count', () => {
    expect(() => Money.fromPesos(1000).divideIntoInstalments(0)).toThrow(InvalidValueError);
    expect(() => Money.fromPesos(1000).divideIntoInstalments(2.5)).toThrow(InvalidValueError);
  });

  it('splits evenly when the amount divides cleanly', () => {
    const parts = Money.fromPesos(1200).divideIntoInstalments(12);
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.toPesos() === 100)).toBe(true);
  });

  it('distributes the remainder one centavo at a time', () => {
    // ₱100.00 ÷ 3 = ₱33.3333…  → 34 + 33 + 33 = 100
    const parts = Money.fromPesos(100).divideIntoInstalments(3);
    expect(parts.map((p) => p.toCentavos())).toEqual([3334, 3333, 3333]);
  });

  /**
   * The guarantee that matters: every schedule the system can generate must
   * sum back to the exact net down payment. Covers all 5 down-payment tiers
   * against all 6 instalment terms from Development Plan.md §8.3.
   */
  it('always sums back exactly across every tier and term', () => {
    const TPP = Money.fromPesos(10_000_000);
    const FEE = Money.fromPesos(50_000);

    const tiers: ReadonlyArray<readonly [number, Money]> = [
      [10, Money.zero()],
      [20, TPP.percentage(20).percentage(10)], // 10% of the down payment
      [30, TPP.percentage(5)], //               5% of the purchase price
      [40, TPP.percentage(10)], //             10% of the purchase price
      [50, TPP.percentage(10)],
    ];
    const terms = [6, 12, 18, 24, 30, 36];

    for (const [pct, discount] of tiers) {
      const net = TPP.percentage(pct).subtract(FEE).subtract(discount);

      for (const term of terms) {
        const parts = net.divideIntoInstalments(term);
        const sum = parts.reduce((acc, p) => acc.add(p), Money.zero());

        expect(sum.toCentavos(), `${pct}% over ${term} months must close exactly`).toBe(
          net.toCentavos(),
        );

        const values = parts.map((p) => p.toCentavos());
        const spread = Math.max(...values) - Math.min(...values);
        expect(spread, `${pct}% over ${term} months must not vary by >1 centavo`).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });
});

describe('Money — formatting', () => {
  it('renders Philippine peso with two decimals and separators', () => {
    expect(Money.fromPesos(39_900_000).format()).toBe('₱39,900,000.00');
    expect(Money.fromCentavos(6_805_556).format()).toBe('₱68,055.56');
    expect(Money.zero().format()).toBe('₱0.00');
  });

  it('serialises to centavos so persisted JSON stays integral', () => {
    expect(JSON.stringify({ price: Money.fromPesos(6_000_000) })).toBe('{"price":600000000}');
  });
});
