import type {
  ClientId,
  EmployeeId,
  ProjectId,
  ReservationNumber,
  UnitId,
} from '../value-objects/identifiers';

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

/**
 * A project or a unit was added to the catalogue.
 *
 * These carry a PRICE, which is what makes them worth logging. The RBAC matrix
 * now lets Marketing add stock, and `purchasePriceCentavos` is the figure
 * PricingService quotes a buyer from — so "who put a ₱6,000,000 unit on the
 * market, and at what price" needs an answer that does not depend on the unit
 * document still saying what it said at the time.
 */
export const projectCreated = (
  project: ProjectId,
  name: string,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('project.created', at, { projectId: project.value, name, createdBy: by.value });

export const unitCreated = (
  unit: UnitId,
  project: ProjectId,
  unitNo: string,
  purchasePriceCentavos: number,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('unit.created', at, {
    unitId: unit.value,
    projectId: project.value,
    unitNo,
    purchasePriceCentavos,
    createdBy: by.value,
  });

/** Before and after, for the same reason `employee.updated` carries them. */
export const unitUpdated = (
  unit: UnitId,
  changes: Readonly<Record<string, { from: unknown; to: unknown }>>,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('unit.updated', at, { unitId: unit.value, changes, updatedBy: by.value });

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

// ── Employees ────────────────────────────────────────────────────────────────

/**
 * An internal account was opened.
 *
 * note.txt leaves IT with one write over people — "accessible add users only" —
 * which makes it the one that most needs recording. The `employees` document
 * carries `createdBy` and answers "who added this person"; this answers the
 * question the document cannot, because a document can be overwritten and
 * `auditLogs` refuses update and delete to every role including the
 * administrator who wrote it (§3.6).
 *
 * `role` is the RESOLVED RBAC role rather than the rank on the form. What
 * matters afterwards is what the new account can reach, and that is the field
 * that decides it.
 */
export const employeeCreated = (
  employee: EmployeeId,
  username: string,
  role: string,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('employee.created', at, {
    employeeId: employee.value,
    username,
    role,
    createdBy: by.value,
  });

/**
 * An internal account was changed.
 *
 * ── Why this carries before AND after ────────────────────────────────────
 *
 * Every other event here records that something happened. This one has to
 * record what it was BEFORE, because the thing being edited is the thing that
 * decides what an account may do. "EMP012 was updated" is useless; "EMP012 went
 * from DOCUMENTATION Staff to DOCUMENTATION Supervisor" is the entire question
 * an auditor is asking, and the employee document only ever holds the answer to
 * half of it — the after.
 *
 * Only the fields that actually moved are passed. An entry listing seven
 * unchanged fields buries the one that changed.
 */
export const employeeUpdated = (
  employee: EmployeeId,
  changes: Readonly<Record<string, { from: unknown; to: unknown }>>,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('employee.updated', at, {
    employeeId: employee.value,
    changes,
    updatedBy: by.value,
  });

/**
 * An internal account was deactivated or brought back.
 *
 * Separate from `employee.updated` although status is a field like any other,
 * because it is the one change that ends someone's access — it disables the
 * Firebase Auth user and revokes their refresh tokens, so a signed-in session
 * dies on its next request. That is worth being able to filter for on its own
 * rather than finding inside a bag of field diffs.
 */
export const employeeStatusChanged = (
  employee: EmployeeId,
  status: string,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('employee.statusChanged', at, {
    employeeId: employee.value,
    status,
    changedBy: by.value,
  });

/**
 * An employee replaced the password they were issued.
 *
 * Carries no password and no hash — only that it happened, and whose account.
 * A credential rotation is the kind of thing an auditor looks for after the
 * fact ("when did this account last change hands"), and the employee document
 * holds only the latest answer.
 *
 * No `by`: the account holder is the only person who can do this. The password
 * itself is changed in the browser against Firebase, so the server never sees
 * it and cannot log it even by accident.
 */
export const employeePasswordChanged = (employee: EmployeeId, at: Date): DomainEvent =>
  event('employee.passwordChanged', at, { employeeId: employee.value });

// ── Announcements ────────────────────────────────────────────────────────────

/**
 * Marketing published something.
 *
 * The announcement itself records `createdBy` for the screen to show. This is
 * the copy that survives the announcement being archived, which is the point:
 * "who put this up" is a question most often asked after it has come down.
 */
export const announcementPublished = (
  announcementId: string,
  title: string,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('announcement.published', at, {
    announcementId,
    title,
    publishedBy: by.value,
  });

export const announcementArchived = (
  announcementId: string,
  by: EmployeeId,
  at: Date,
): DomainEvent =>
  event('announcement.archived', at, {
    announcementId,
    archivedBy: by.value,
  });

// ── Clients ──────────────────────────────────────────────────────────────────

/**
 * A buyer edited their own profile.
 *
 * Carries BOTH sides of every field that moved, not just the new value. The
 * question this log exists to answer is not "what does the account say now" —
 * the client document already answers that — but "what did it say when
 * Documentation Staff checked the government ID against it". A verifier
 * approved a name; if that name later changes, the approval has to stay
 * legible.
 *
 * The actor is the buyer's own id rather than an EmployeeId: this is the one
 * audited action in the system that a CLIENT performs on their own record.
 */
export const clientProfileUpdated = (
  client: ClientId,
  changes: Readonly<Record<string, { readonly from: unknown; readonly to: unknown }>>,
  at: Date,
): DomainEvent =>
  event('client.profileUpdated', at, {
    clientId: client.value,
    fields: Object.keys(changes),
    changes,
  });
