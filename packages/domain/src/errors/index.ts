/**
 * Domain error hierarchy.
 *
 * These are thrown by entities and value objects when a business invariant is
 * violated. They are deliberately distinct from infrastructure failures — a
 * `DomainError` means the caller asked for something the business forbids, not
 * that the database was unreachable.
 *
 * See Development Plan.md §3.9.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A value object rejected its input (negative money, malformed identifier). */
export class InvalidValueError extends DomainError {}

/** An entity was asked to move to a status its lifecycle does not permit. */
export class IllegalStateTransitionError extends DomainError {
  constructor(
    readonly from: string,
    readonly to: string,
    entity = 'Entity',
  ) {
    super(`${entity} cannot transition from "${from}" to "${to}".`);
  }
}

/** A unit was selected for reservation but is no longer Available. */
export class UnitNotAvailableError extends DomainError {
  constructor(unitId: string, currentStatus: string) {
    super(`Unit ${unitId} is not available for reservation (status: ${currentStatus}).`);
  }
}

/** A business rule blocked an otherwise well-formed operation. */
export class BusinessRuleViolationError extends DomainError {}
