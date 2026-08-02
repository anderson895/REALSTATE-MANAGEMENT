import { BusinessRuleViolationError, IllegalStateTransitionError } from '../errors';
import { ClientId, EmployeeId, ParkingSlotId, ReservationNumber, UnitId } from '../value-objects/identifiers';
import {
  contractSigned,
  deficiencyNoted,
  documentsVerified,
  paymentVerified,
  permanentAccountActivated,
  reservationApproved,
  reservationCancelled,
  reservationExpired,
  reservationSubmitted,
  type DomainEvent,
} from '../events/domain-event';
import type { DownPaymentTier } from '../pricing/discount-strategy';
import type { FinancingOption, PaymentTerm } from '../pricing/pricing.service';

/**
 * Reservation lifecycle, transcribed from the flow in RESERVATION.doc and
 * drawn out in Development Plan.md §8.4.
 */
export const RESERVATION_STATUSES = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DocumentsVerified',
  'Approved',
  'ContractSigned',
  'Completed',
  'DeficiencyNoted',
  'Expired',
  'Cancelled',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Days the buyer has to submit documentary requirements. */
export const DOCUMENT_SUBMISSION_DAYS = 30;
/** Hours the buyer has to cure a noted deficiency. */
export const DEFICIENCY_CURE_HOURS = 24;

export interface ReservationTerms {
  readonly downPaymentTier: DownPaymentTier;
  readonly paymentTerm: PaymentTerm;
  readonly financingOption: FinancingOption;
}

export interface ReservationProps {
  readonly number: ReservationNumber;
  readonly clientId: ClientId;
  readonly unitId: UnitId;
  readonly parkingSlotId: ParkingSlotId | null;
  readonly salesAgentId: string | null;
  readonly terms: ReservationTerms;
  readonly reservedAt: Date;
  readonly status: ReservationStatus;
  readonly deficiencyDueAt: Date | null;
  readonly deficiencyReason: string | null;
}

/**
 * A condominium unit reservation.
 *
 * The status machine lives here, inside the entity, with `_status` private.
 * No service, route handler, or component can move a reservation illegally —
 * the only way through is `transitionTo`, and it consults the table below.
 *
 * Time is always passed in, never read from the clock. That keeps every rule
 * here deterministic and testable without freezing timers.
 *
 * See Development Plan.md §3.9 and §8.4.
 */
export class Reservation {
  private static readonly ALLOWED: Record<ReservationStatus, readonly ReservationStatus[]> = {
    PendingPaymentVerification: ['PaymentVerified', 'DeficiencyNoted'],
    PaymentVerified: ['DocumentsVerified', 'DeficiencyNoted'],
    DocumentsVerified: ['Approved', 'DeficiencyNoted'],
    Approved: ['ContractSigned'],
    ContractSigned: ['Completed'],
    DeficiencyNoted: ['PaymentVerified', 'DocumentsVerified', 'Expired'],
    Expired: ['Cancelled'],
    Cancelled: [], // terminal — record retained for audit
    Completed: [], // terminal — permanent client account issued
  };

  private _status: ReservationStatus;
  private _deficiencyDueAt: Date | null;
  private _deficiencyReason: string | null;
  private readonly _events: DomainEvent[] = [];

  private constructor(
    readonly number: ReservationNumber,
    readonly clientId: ClientId,
    readonly unitId: UnitId,
    readonly parkingSlotId: ParkingSlotId | null,
    readonly salesAgentId: string | null,
    readonly terms: ReservationTerms,
    readonly reservedAt: Date,
    status: ReservationStatus,
    deficiencyDueAt: Date | null,
    deficiencyReason: string | null,
  ) {
    this._status = status;
    this._deficiencyDueAt = deficiencyDueAt;
    this._deficiencyReason = deficiencyReason;
  }

  /** Submits a new reservation. Always starts pending payment verification. */
  static create(props: Omit<ReservationProps, 'status' | 'deficiencyDueAt' | 'deficiencyReason'>): Reservation {
    const reservation = new Reservation(
      props.number,
      props.clientId,
      props.unitId,
      props.parkingSlotId,
      props.salesAgentId,
      props.terms,
      props.reservedAt,
      'PendingPaymentVerification',
      null,
      null,
    );
    reservation._events.push(
      reservationSubmitted(props.number, props.clientId, props.unitId, props.reservedAt),
    );
    return reservation;
  }

  /** Rebuilds from storage without re-running creation-time rules. */
  static reconstitute(props: ReservationProps): Reservation {
    return new Reservation(
      props.number,
      props.clientId,
      props.unitId,
      props.parkingSlotId,
      props.salesAgentId,
      props.terms,
      props.reservedAt,
      props.status,
      props.deficiencyDueAt,
      props.deficiencyReason,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  get status(): ReservationStatus {
    return this._status;
  }

  get deficiencyDueAt(): Date | null {
    return this._deficiencyDueAt;
  }

  get deficiencyReason(): string | null {
    return this._deficiencyReason;
  }

  isTerminal(): boolean {
    return Reservation.ALLOWED[this._status].length === 0;
  }

  /** Deadline for documentary requirements — 30 calendar days from reservation. */
  get documentDeadline(): Date {
    const due = new Date(this.reservedAt);
    due.setDate(due.getDate() + DOCUMENT_SUBMISSION_DAYS);
    return due;
  }

  /** True once the 24-hour deficiency window has elapsed unaddressed. */
  isDeficiencyOverdue(now: Date): boolean {
    return (
      this._status === 'DeficiencyNoted' &&
      this._deficiencyDueAt !== null &&
      now.getTime() > this._deficiencyDueAt.getTime()
    );
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  /**
   * Account Receivables confirms the reservation fee landed.
   * The unit is placed On Hold by the caller in the same transaction.
   */
  verifyPayment(by: EmployeeId, at: Date): void {
    this.transitionTo('PaymentVerified');
    this.clearDeficiency();
    this._events.push(paymentVerified(this.number, by, at));
  }

  /** Documentation Department accepts the uploaded requirements. */
  verifyDocuments(by: EmployeeId, at: Date): void {
    this.transitionTo('DocumentsVerified');
    this.clearDeficiency();
    this._events.push(documentsVerified(this.number, by, at));
  }

  /**
   * Final approval. RBAC.xls: "All Supervisor per personnel is the approver of
   * the transaction, they are the final stage of the transaction."
   */
  approve(by: EmployeeId, isSupervisor: boolean, at: Date): void {
    if (!isSupervisor) {
      throw new BusinessRuleViolationError(
        `Reservation ${this.number.value} can only be approved by a supervisor.`,
      );
    }
    this.transitionTo('Approved');
    this._events.push(reservationApproved(this.number, by, at));
  }

  /** Buyer signs the Contract to Sell. */
  signContract(at: Date): void {
    this.transitionTo('ContractSigned');
    this._events.push(contractSigned(this.number, at));
  }

  /** Documentation Staff activates the Permanent Client Account. */
  activatePermanentAccount(by: EmployeeId, at: Date): void {
    this.transitionTo('Completed');
    this._events.push(permanentAccountActivated(this.number, this.clientId, by, at));
  }

  /** A deficiency was found. Starts the 24-hour cure window. */
  noteDeficiency(reason: string, by: EmployeeId, at: Date): void {
    if (reason.trim().length === 0) {
      throw new BusinessRuleViolationError('A deficiency notice must state a reason.');
    }
    this.transitionTo('DeficiencyNoted');
    const due = new Date(at.getTime() + DEFICIENCY_CURE_HOURS * 60 * 60 * 1000);
    this._deficiencyDueAt = due;
    this._deficiencyReason = reason;
    this._events.push(deficiencyNoted(this.number, reason, by, due, at));
  }

  /**
   * The cure window lapsed. Lands the reservation in the Expired Reservation
   * Report — it does NOT cancel. RESERVATION.doc: "The system does not
   * automatically cancel expired reservations."
   */
  markExpired(at: Date): void {
    this.transitionTo('Expired');
    this._events.push(reservationExpired(this.number, at));
  }

  /**
   * Manual cancellation by authorised personnel with management approval.
   *
   * Two distinct people are required, and only from Expired — which is what
   * stops a single staff member cancelling a live reservation outright.
   */
  cancel(by: EmployeeId, approvedBy: EmployeeId, reason: string, at: Date): void {
    if (this._status !== 'Expired') {
      throw new BusinessRuleViolationError(
        `Only expired reservations may be cancelled. ${this.number.value} is ${this._status}.`,
      );
    }
    if (by.equals(approvedBy)) {
      throw new BusinessRuleViolationError(
        'Cancellation requires management approval from a second person.',
      );
    }
    if (reason.trim().length === 0) {
      throw new BusinessRuleViolationError('A cancellation must state a reason.');
    }
    this.transitionTo('Cancelled');
    this._events.push(reservationCancelled(this.number, by, approvedBy, reason, at));
  }

  private clearDeficiency(): void {
    this._deficiencyDueAt = null;
    this._deficiencyReason = null;
  }

  private transitionTo(next: ReservationStatus): void {
    if (!Reservation.ALLOWED[this._status].includes(next)) {
      throw new IllegalStateTransitionError(
        this._status,
        next,
        `Reservation ${this.number.value}`,
      );
    }
    this._status = next;
  }

  // ── Events ───────────────────────────────────────────────────────────────

  pullEvents(): DomainEvent[] {
    return this._events.splice(0, this._events.length);
  }
}
