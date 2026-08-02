import { InvalidValueError } from '../errors';

/**
 * An immutable peso amount, stored as a whole number of centavos.
 *
 * Why not `number` in pesos: IEEE-754 cannot represent 0.1 exactly. Across a
 * 36-month amortisation schedule that error compounds and the final balance
 * does not close to zero. Every amount in SFSR-REMS is an integer centavo
 * count; pesos exist only at the presentation edge via `format()`.
 *
 * See Development Plan.md §3.5 and §3.9.
 */
export class Money {
  private constructor(private readonly centavos: number) {
    if (!Number.isFinite(centavos)) {
      throw new InvalidValueError('Money must be a finite number.');
    }
    if (!Number.isInteger(centavos)) {
      throw new InvalidValueError(
        `Money must be a whole number of centavos, received ${centavos}.`,
      );
    }
    if (centavos < 0) {
      throw new InvalidValueError(`Money cannot be negative, received ${centavos} centavos.`);
    }
  }

  // ── Factories ────────────────────────────────────────────────────────────

  static fromCentavos(centavos: number): Money {
    return new Money(centavos);
  }

  /**
   * Builds from a peso figure. Rounds to the nearest centavo, so callers must
   * not rely on this for exact arithmetic — prefer `fromCentavos` when the
   * source is already an integer (as the seeded inventory is).
   */
  static fromPesos(pesos: number): Money {
    if (!Number.isFinite(pesos)) {
      throw new InvalidValueError('Money must be a finite number.');
    }
    return new Money(Math.round(pesos * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  // ── Arithmetic (always returns a new instance) ───────────────────────────

  add(other: Money): Money {
    return new Money(this.centavos + other.centavos);
  }

  /** Throws if the result would be negative — Money has no signed form. */
  subtract(other: Money): Money {
    return new Money(this.centavos - other.centavos);
  }

  /** `rate` is a percentage: `percentage(10)` is 10%, not 1000%. */
  percentage(rate: number): Money {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new InvalidValueError(`Percentage must be a non-negative number, received ${rate}.`);
    }
    return new Money(Math.round((this.centavos * rate) / 100));
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new InvalidValueError(`Factor must be a non-negative number, received ${factor}.`);
    }
    return new Money(Math.round(this.centavos * factor));
  }

  /**
   * Splits into `count` instalments that sum back to exactly this amount.
   *
   * Naive division loses centavos: ₱2,450,000 ÷ 36 does not divide evenly, and
   * 36 × the rounded quotient will not equal the original. The remainder is
   * distributed one centavo at a time across the earliest instalments, so the
   * schedule always closes and no two instalments differ by more than ₱0.01.
   */
  divideIntoInstalments(count: number): Money[] {
    if (!Number.isInteger(count) || count < 1) {
      throw new InvalidValueError(`Instalment count must be a positive integer, received ${count}.`);
    }
    const base = Math.floor(this.centavos / count);
    const remainder = this.centavos - base * count;
    return Array.from({ length: count }, (_, i) => new Money(base + (i < remainder ? 1 : 0)));
  }

  // ── Comparison ───────────────────────────────────────────────────────────

  equals(other: Money): boolean {
    return this.centavos === other.centavos;
  }

  isZero(): boolean {
    return this.centavos === 0;
  }

  isGreaterThan(other: Money): boolean {
    return this.centavos > other.centavos;
  }

  isLessThan(other: Money): boolean {
    return this.centavos < other.centavos;
  }

  // ── Output ───────────────────────────────────────────────────────────────

  toCentavos(): number {
    return this.centavos;
  }

  /** Lossy — for display only. Never feed the result back into arithmetic. */
  toPesos(): number {
    return this.centavos / 100;
  }

  /** e.g. `₱15,000,000.00` */
  format(): string {
    const pesos = (this.centavos / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `₱${pesos}`;
  }

  toString(): string {
    return this.format();
  }

  toJSON(): number {
    return this.centavos;
  }
}
