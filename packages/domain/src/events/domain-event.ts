import type { ClientId, EmployeeId, ReservationNumber, UnitId } from '../value-objects/identifiers';

/**
 * Something that happened in the domain, recorded by the entity that caused it.
 *
 * Entities collect these rather than writing to a log directly: the domain
 * layer must not know an audit log exists (§5.5). The application layer drains
 * `pullEvents()` inside the same transaction that persists the entity, so an
 * approved reservation and its audit entry commit together or not at all.
 */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

function event(type: string, occurredAt: Date, payload: Record<string, unknown>): DomainEvent {
  return { type, occurredAt, payload: Object.freeze({ ...payload }) };
}

// ── Unit ─────────────────────────────────────────────────────────────────────

export const unitHeld = (unit: UnitId, reservation: ReservationNumber, at: Date): DomainEvent =>
  event('unit.held', at, { unitId: unit.value, reservationNumber: reservation.value });

export const unitSold = (unit: UnitId, reservation: ReservationNumber, at: Date): DomainEvent =>
  event('unit.sold', at, { unitId: unit.value, reservationNumber: reservation.value });

export const unitReleased = (unit: UnitId, reason: string, at: Date): DomainEvent =>
  event('unit.released', at, { unitId: unit.value, reason });

// ── Reservation ──────────────────────────────────────────────────────────────

export const reservationSubmitted = (
  reservation: ReservationNumber,
  client: ClientId,
  unit: UnitId,
  at: Date,
): DomainEvent =>
  event('reservation.submitted', at, {
    reservationNumber: reservation.value,
    clientId: client.value,
    unitId: unit.value,
  });

export const paymentVerified = (
  reservation: ReservationNumber,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('reservation.paymentVerified', at, {
    reservationNumber: reservation.value,
    verifiedBy: by.value,
  });

export const documentsVerified = (
  reservation: ReservationNumber,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('reservation.documentsVerified', at, {
    reservationNumber: reservation.value,
    verifiedBy: by.value,
  });

export const reservationApproved = (
  reservation: ReservationNumber,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('reservation.approved', at, {
    reservationNumber: reservation.value,
    approvedBy: by.value,
  });

export const deficiencyNoted = (
  reservation: ReservationNumber,
  reason: string,
  by: EmployeeId,
  dueAt: Date,
  at: Date,
): DomainEvent =>
  event('reservation.deficiencyNoted', at, {
    reservationNumber: reservation.value,
    reason,
    notedBy: by.value,
    dueAt: dueAt.toISOString(),
  });

export const reservationExpired = (reservation: ReservationNumber, at: Date): DomainEvent =>
  event('reservation.expired', at, { reservationNumber: reservation.value });

export const reservationCancelled = (
  reservation: ReservationNumber,
  by: EmployeeId,
  approvedBy: EmployeeId,
  reason: string,
  at: Date,
): DomainEvent =>
  event('reservation.cancelled', at, {
    reservationNumber: reservation.value,
    cancelledBy: by.value,
    approvedBy: approvedBy.value,
    reason,
  });

export const contractSigned = (reservation: ReservationNumber, at: Date): DomainEvent =>
  event('reservation.contractSigned', at, { reservationNumber: reservation.value });

export const permanentAccountActivated = (
  reservation: ReservationNumber,
  client: ClientId,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('reservation.permanentAccountActivated', at, {
    reservationNumber: reservation.value,
    clientId: client.value,
    activatedBy: by.value,
  });
