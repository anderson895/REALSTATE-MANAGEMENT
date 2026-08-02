import { InvalidValueError } from '../errors';

/**
 * Base for string identifiers.
 *
 * Wrapping ids in distinct classes stops a `ProjectId` being passed where a
 * `UnitId` is expected — a mistake raw `string` parameters make easy and the
 * compiler cannot catch.
 */
abstract class Identifier {
  protected constructor(readonly value: string) {
    const trimmed = value?.trim() ?? '';
    if (trimmed.length === 0) {
      throw new InvalidValueError(`${new.target.name} cannot be empty.`);
    }
  }

  equals(other: Identifier): boolean {
    return this.constructor === other.constructor && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

/** e.g. `TLP001`, `EPR002`, `SQR003` */
export class ProjectId extends Identifier {
  constructor(value: string) {
    super(value.trim().toUpperCase());
  }
}

/** e.g. `U001`, `EU001`, `SQ001`, `GV001`, `HP001` */
export class UnitId extends Identifier {
  constructor(value: string) {
    super(value.trim().toUpperCase());
  }
}

/** e.g. `PK001`, `EPK001`, `SP001`, `GVP001`, `HPP001` */
export class ParkingSlotId extends Identifier {
  constructor(value: string) {
    super(value.trim().toUpperCase());
  }
}

/** Firebase Auth uid of a buyer. Case-sensitive — uids are not uppercased. */
export class ClientId extends Identifier {
  constructor(value: string) {
    super(value.trim());
  }
}

/** e.g. `EMP001` — from RBAC.xls */
export class EmployeeId extends Identifier {
  constructor(value: string) {
    super(value.trim().toUpperCase());
  }
}

/** e.g. `AG001`, `BR001`, `GH001` — from SALES STAFF DATABASE.xls */
export class SalesStaffId extends Identifier {
  constructor(value: string) {
    super(value.trim().toUpperCase());
  }
}

/**
 * Reservation reference number, format `RES-YYYY-NNNNNN`.
 *
 * The sample in RESERVATION.doc is `RES-2026-000001`. The sequence is
 * six digits, zero-padded, and allocated inside the submit transaction so the
 * series is gap-free under concurrency (Development Plan.md §8.6).
 */
export class ReservationNumber {
  private static readonly PATTERN = /^RES-(\d{4})-(\d{6})$/;

  private constructor(
    readonly value: string,
    readonly year: number,
    readonly sequence: number,
  ) {}

  static create(year: number, sequence: number): ReservationNumber {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new InvalidValueError(`Reservation year must be a 4-digit year, received ${year}.`);
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
      throw new InvalidValueError(
        `Reservation sequence must be between 1 and 999999, received ${sequence}.`,
      );
    }
    const value = `RES-${year}-${String(sequence).padStart(6, '0')}`;
    return new ReservationNumber(value, year, sequence);
  }

  static parse(value: string): ReservationNumber {
    const match = ReservationNumber.PATTERN.exec(value.trim().toUpperCase());
    if (!match) {
      throw new InvalidValueError(
        `Reservation number must match RES-YYYY-NNNNNN, received "${value}".`,
      );
    }
    // Both groups are guaranteed present by the pattern above.
    return ReservationNumber.create(Number(match[1]), Number(match[2]));
  }

  equals(other: ReservationNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
