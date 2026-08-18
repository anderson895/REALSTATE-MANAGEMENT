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

/**
 * How a reservation fee may be paid.
 *
 * Cash and Check were on this list and are deliberately gone. Every channel
 * here survives the same check: Billing confirms the money REACHED the
 * company's bank account, working from a reference number and the uploaded
 * receipt. Cash across a counter has neither at the moment of submission, and
 * a check is a promise that has not cleared.
 *
 * ── Why this lives in the domain and not beside a form ───────────────────
 *
 * It was declared in the Portal's schema file, which was fine while the Portal
 * was the only way in. The walk-in counter is a second way in, and the client
 * was explicit that the same rule applies to it — "pati sa walk in alisin nadin
 * ang cash at check". A second copy in the Internal app would have been one
 * edit away from letting a walk-in accept cash that Billing has no way to
 * verify. One list, both doors.
 */
export const PAYMENT_CHANNELS = ['Bank Deposit', 'Online Banking', 'GCash', 'Maya'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/**
 * WHERE the reservation fee is actually sent.
 *
 * From `Development_Guide/bank-ewallet-details.doc`: "painsert po pala dito
 * yung details kung san po magdeposit ng payment. After po ng summary."
 *
 * Until this existed the Portal asked a buyer to pay ₱50,000 and then to upload
 * the receipt, without ever saying to whom — every account number came over the
 * phone from an agent. That is also the shape of the commonest fraud in
 * pre-selling: a buyer who was never shown an official account has no way to
 * tell a real one from a substituted one.
 *
 * ── Beside PAYMENT_CHANNELS on purpose ───────────────────────────────────
 *
 * `channels` ties each destination to the entries a buyer can pick above, so
 * the two lists cannot drift into a channel with nowhere to send money, or a
 * published account no channel reaches. Same argument as the note on
 * PAYMENT_CHANNELS itself: the walk-in counter is a second door, and a second
 * copy of an account number is the one that goes stale after the company
 * changes banks.
 *
 * ── Two departures from the source document ──────────────────────────────
 *
 * It reads "Bank of the Philippines Islands". The institution is Bank of the
 * Philippine Islands, and this is rendered on the screen where somebody decides
 * whether the page is genuine before parting with ₱50,000 — a misspelt bank is
 * exactly what a careful buyer is checking for.
 *
 * It also labels the Maya block "GCash Merchant Name" and "GCash Wallet
 * Number", plainly a copy of the block above it. The labels here are neutral
 * and the wallet is named once, in `label`, so the same mistake cannot be made
 * twice.
 *
 * Both are corrections to wording, not to numbers. Every digit below is
 * verbatim from the document and must stay that way.
 */
export interface RemittanceAccount {
  readonly label: string;
  readonly channels: readonly PaymentChannel[];
  /** Label/value pairs, in the order they should be read. */
  readonly details: readonly (readonly [string, string])[];
}

export const REMITTANCE_ACCOUNTS: readonly RemittanceAccount[] = [
  {
    label: 'Bank Transfer / Deposit',
    channels: ['Bank Deposit', 'Online Banking'],
    details: [
      ['Bank name', 'Bank of the Philippine Islands'],
      ['Account name', 'St. Francis Square Realty Corp'],
      ['Account number', '2429661326'],
      ['Account type', 'Savings Account'],
    ],
  },
  {
    label: 'GCash Wallet',
    channels: ['GCash'],
    details: [
      ['Merchant name', 'St. Francis Square Realty Corp'],
      ['Wallet number', '09173770767'],
    ],
  },
  {
    label: 'Maya Wallet',
    channels: ['Maya'],
    details: [
      ['Merchant name', 'St. Francis Square Realty Corp'],
      ['Wallet number', '09420689658'],
    ],
  },
] as const;

/** Civil status options on the buyer information step. RESERVATION.doc STEP 2. */
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'] as const;
export type CivilStatus = (typeof CIVIL_STATUSES)[number];

/**
 * Where a reservation was raised.
 *
 * note.txt asks for both to be visible on the Client Master Files screen —
 * "Approved Reservation from (Internal and Portal)" — so this is data, not a
 * label: `Portal` is the buyer acting for themselves, `Internal` is a walk-in
 * encoded by Documentation at the counter.
 */
export const RESERVATION_SOURCES = ['Portal', 'Internal'] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

/**
 * The statuses a Sales Agent is allowed to see.
 *
 * note.txt: "si sales agent hindi makaka receieved ng verification —
 * marerecieved lang ni sales agent kapag verified na lahat sa billing,
 * documentation, Documentation Supervisor".
 *
 * So the agent who sold the unit learns the outcome, not the process. What is
 * being kept from them is the middle of the transaction: a half-verified
 * payment, a rejected ID, the reason a deficiency was raised. Those belong to
 * the desks working them, and an agent watching the queue is an agent ringing
 * Documentation to ask why their commission is slow.
 *
 * `Approved` is the first status on this list because it is the one the
 * Documentation Supervisor's signature produces — everything before it is
 * still verification. `Expired` and `Cancelled` are deliberately absent: they
 * are outcomes too, but the sheet's Sales screens are "Reservation List" and
 * "Sales Closed", and a cancellation is neither.
 *
 * Mirrored by the /reservations read rule in firestore.rules. Move one and the
 * other has to move with it.
 */
export const SALES_VISIBLE_STATUSES = ['Approved', 'ContractSigned', 'Completed'] as const;

export function isVisibleToSales(status: ReservationStatus): boolean {
  return (SALES_VISIBLE_STATUSES as readonly ReservationStatus[]).includes(status);
}

/** Days the buyer has to submit documentary requirements. */
export const DOCUMENT_SUBMISSION_DAYS = 30;
/** Hours the buyer has to cure a noted deficiency. */
export const DEFICIENCY_CURE_HOURS = 24;

export interface ReservationTerms {
  readonly downPaymentTier: DownPaymentTier;
  readonly paymentTerm: PaymentTerm;
  readonly financingOption: FinancingOption;
}

/**
 * Who cleared one half of the verification, and when.
 *
 * note.txt: "Audit trail — ilologs kung sinong staff ang nag verify, at kung
 * sinong super visor ang nag approve." The audit log already records the
 * event; this keeps the same fact ON the reservation, so the approval gate can
 * be decided from the record itself rather than by replaying its history.
 */
export interface VerificationRecord {
  readonly by: EmployeeId;
  readonly at: Date;
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
  /**
   * Optional so a reservation stored before the tracks were split still
   * reconstitutes — it simply comes back with neither half recorded.
   */
  readonly paymentVerified?: VerificationRecord | null;
  readonly documentsVerified?: VerificationRecord | null;
  readonly approved?: VerificationRecord | null;
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
  /**
   * ── Payment and documents are now PARALLEL ──────────────────────────────
   *
   * note.txt: "ang makaka receieved lang ng bagong reservation ay Simultanious
   * - documentation - account recievable". A new reservation lands on both
   * desks at once and either may finish first, so the old chain —
   * Pending -> PaymentVerified -> DocumentsVerified -> Approved — no longer
   * describes the work. Requiring Billing to go first meant Documentation sat
   * on a complete set of IDs unable to record that fact.
   *
   * The two tracks are recorded in `_paymentVerified` and `_documentsVerified`
   * instead. `status` is DERIVED from that pair (see `deriveStatus`) so the
   * nine stored statuses, the queues and every screen reading them are
   * untouched — but it is a summary now, not the source of truth.
   *
   * `PendingPaymentVerification` therefore accepts `DocumentsVerified`
   * directly: that is documents finishing while payment is still outstanding.
   */
  private static readonly ALLOWED: Record<ReservationStatus, readonly ReservationStatus[]> = {
    PendingPaymentVerification: ['PaymentVerified', 'DocumentsVerified', 'DeficiencyNoted'],
    PaymentVerified: ['DocumentsVerified', 'PendingPaymentVerification', 'DeficiencyNoted'],
    DocumentsVerified: ['Approved', 'PaymentVerified', 'PendingPaymentVerification', 'DeficiencyNoted'],
    Approved: ['ContractSigned'],
    ContractSigned: ['Completed'],
    DeficiencyNoted: ['PendingPaymentVerification', 'PaymentVerified', 'DocumentsVerified', 'Expired'],
    Expired: ['Cancelled'],
    Cancelled: [], // terminal — record retained for audit
    Completed: [], // terminal — permanent client account issued
  };

  private _status: ReservationStatus;
  private _deficiencyDueAt: Date | null;
  private _deficiencyReason: string | null;
  /** Who cleared the reservation fee, and when. Billing's track. */
  private _paymentVerified: VerificationRecord | null;
  /** Who accepted the documentary requirements. Documentation's track. */
  private _documentsVerified: VerificationRecord | null;
  /**
   * Which supervisor signed it off.
   *
   * note.txt: "at kung sinong super visor ang nag approve". The approval event
   * already carries this into the audit log, but a screen showing the trail
   * would have to replay the log to find it — and `auditLogs` is append-only
   * and unindexed by reservation. Keeping it on the record makes it one read.
   */
  private _approved: VerificationRecord | null;
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
    paymentVerified: VerificationRecord | null,
    documentsVerified: VerificationRecord | null,
    approved: VerificationRecord | null,
  ) {
    this._status = status;
    this._deficiencyDueAt = deficiencyDueAt;
    this._deficiencyReason = deficiencyReason;
    this._paymentVerified = paymentVerified;
    this._documentsVerified = documentsVerified;
    this._approved = approved;
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
      null,
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
      props.paymentVerified ?? null,
      props.documentsVerified ?? null,
      props.approved ?? null,
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

  get paymentVerified(): VerificationRecord | null {
    return this._paymentVerified;
  }

  get documentsVerified(): VerificationRecord | null {
    return this._documentsVerified;
  }

  get approved(): VerificationRecord | null {
    return this._approved;
  }

  /**
   * Both desks are finished and a supervisor may now sign.
   *
   * The gate note.txt asks for: "Final approval = Documentation Supervisor
   * (maapprove niya lang final kung approve na ng billing and documentation)".
   */
  get isFullyVerified(): boolean {
    return this._paymentVerified !== null && this._documentsVerified !== null;
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
   * Billing confirms the reservation fee landed.
   * The unit is placed On Hold by the caller in the same transaction.
   *
   * note.txt: "approver hati hatiin ang access — payment = billing". Records
   * WHO cleared it, which is half of "ilologs kung sinong staff ang nag verify".
   */
  verifyPayment(by: EmployeeId, at: Date): void {
    // Re-verification is allowed ONLY while curing a deficiency. Without that
    // exception, noting one on a fully verified reservation left it stuck:
    // both flags set so neither desk could act, and `Approved` unreachable
    // from `DeficiencyNoted`, so expiry was the only way out of a problem the
    // buyer had 24 hours to fix.
    if (this._paymentVerified && this._status !== 'DeficiencyNoted') {
      throw new BusinessRuleViolationError(
        `Payment on ${this.number.value} was already verified by ${this._paymentVerified.by.value}.`,
      );
    }
    this._paymentVerified = { by, at };
    this.clearDeficiency();
    this.syncStatus();
    this._events.push(paymentVerified(this.number, by, at));
  }

  /**
   * Documentation accepts the uploaded requirements — note.txt: "ID =
   * documentation". Independent of payment: either desk may finish first.
   */
  verifyDocuments(by: EmployeeId, at: Date): void {
    if (this._documentsVerified && this._status !== 'DeficiencyNoted') {
      throw new BusinessRuleViolationError(
        `Documents on ${this.number.value} were already verified by ${this._documentsVerified.by.value}.`,
      );
    }
    this._documentsVerified = { by, at };
    this.clearDeficiency();
    this.syncStatus();
    this._events.push(documentsVerified(this.number, by, at));
  }

  /**
   * Final approval. RBAC.xls: "All Supervisor per personnel is the approver of
   * the transaction, they are the final stage of the transaction."
   *
   * note.txt narrows it: "Final approval = Documentation Supervisor (maapprove
   * niya lang final kung approve na ng billing and documentation)". Both desks
   * must have finished, and the entity refuses otherwise — the screen hides
   * the button, but hiding a button is not a control.
   *
   * The message names what is still outstanding. "Cannot approve" sends a
   * supervisor hunting; "payment has not been verified" tells them who to ask.
   */
  approve(by: EmployeeId, isSupervisor: boolean, at: Date): void {
    if (!isSupervisor) {
      throw new BusinessRuleViolationError(
        `Reservation ${this.number.value} can only be approved by a supervisor.`,
      );
    }
    if (!this.isFullyVerified) {
      const missing = [
        this._paymentVerified ? null : 'payment (Billing)',
        this._documentsVerified ? null : 'documentary requirements (Documentation)',
      ].filter((part): part is string => part !== null);

      throw new BusinessRuleViolationError(
        `Reservation ${this.number.value} cannot be approved until ${missing.join(' and ')} ` +
          `${missing.length === 1 ? 'has' : 'have'} been verified.`,
      );
    }
    this.transitionTo('Approved');
    this._approved = { by, at };
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

  /**
   * The headline status, computed from the two verification tracks.
   *
   * `DocumentsVerified` means BOTH are done and the reservation is waiting on
   * a supervisor — it is the last stop before `Approved`, which is what the
   * approval queue already filters on, so that screen keeps working unchanged.
   *
   * Documents-done-but-payment-outstanding reports as
   * `PendingPaymentVerification`, which is literally true: the payment IS
   * still pending. The flags say which half is finished; the status says what
   * the reservation is still waiting for.
   */
  /**
   * Moves the headline only if the derived status actually differs.
   *
   * Recording documents while payment is still outstanding leaves the status
   * where it was, and routing that through `transitionTo` would ask the state
   * machine for a self-transition it rightly refuses. The work still happened;
   * the summary just has nothing new to say.
   */
  private syncStatus(): void {
    const next = this.deriveStatus();
    if (next !== this._status) this.transitionTo(next);
  }

  private deriveStatus(): ReservationStatus {
    if (this._paymentVerified && this._documentsVerified) return 'DocumentsVerified';
    if (this._paymentVerified) return 'PaymentVerified';
    return 'PendingPaymentVerification';
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
