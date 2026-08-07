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
 * Quotable reference for a tripping request, format `TR-YYYYMMDD-XXXX`.
 *
 * ── Why this is derived rather than stored ────────────────────────────────
 *
 * INTERNAL.xls sheet `USER INTERFACE` shows the Sales Agent's queue with a
 * REQUEST ID column reading `TR-2025-0518-001`. There is no counter behind
 * that: the Portal creates trippings with `.add()`, so the only identifier a
 * request has is a 20-character Firestore id nobody is going to read down a
 * phone. Allocating a real sequence would mean a counter document and a
 * transaction on every request, to number something that is never used as a
 * key. This composes the date the request was raised with a short slice of
 * that id instead — stable, free, and close enough to the sheet's shape to be
 * recognised.
 *
 * ── Why it lives in the domain and not in either app ──────────────────────
 *
 * BOTH surfaces show it: the buyer sees it on the Portal as proof the request
 * is theirs, and the agent sees it on the Internal queue. It is the string the
 * two of them say to each other, so there cannot be two implementations of it.
 * A copy in each app that drifts by one character is a buyer reading out a
 * reference the agent cannot find.
 *
 * DISPLAY ONLY. Every write still addresses the real document id, so a
 * collision here could confuse a conversation but cannot mis-address an
 * update. Four uppercased base-62 characters give roughly 14 million
 * combinations against the handful of requests raised on any one day, which is
 * the only window in which two references are ever seen side by side.
 */
export function trippingReference(
  id: string,
  /** Firestore hands this back as a Timestamp; the query layer as an ISO string. */
  requestedAt: Date | string | null | undefined,
): string {
  const suffix = id.trim().slice(0, 4).toUpperCase();
  const day = requestedDay(requestedAt);
  return day ? `TR-${day}-${suffix}` : `TR-${suffix}`;
}

/** `YYYYMMDD` in UTC, or null when the timestamp has not landed yet. */
function requestedDay(value: Date | string | null | undefined): string | null {
  if (value == null) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // UTC, deliberately. The reference is quoted between a buyer and an agent
  // who may be reading it off two machines in different zones, and a reference
  // that changes depending on where it is rendered is not one.
  return date.toISOString().slice(0, 10).replace(/-/g, '');
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
