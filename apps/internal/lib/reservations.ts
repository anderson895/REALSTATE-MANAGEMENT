import {
  ReservationWorkflowService,
  can,
  type InternalActor,
  type InternalRole,
  type Module,
  type ReservationStatus,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  FirestoreReservationRepository,
  FirestoreUnitOfWork,
  FirestoreUnitRepository,
  getAdminFirestore,
} from '@sfsr/infrastructure/server';

/**
 * Composition root for the Internal reservation screens.
 *
 * The workflow service holds no state between calls, so building one per
 * request is free and avoids a module-level singleton capturing a Firestore
 * handle before the admin app is initialised.
 */
export function reservationWorkflow(): ReservationWorkflowService {
  const db = getAdminFirestore();
  return new ReservationWorkflowService(
    new FirestoreUnitRepository(db),
    new FirestoreReservationRepository(db),
    new FirestoreAuditLogger(db),
    new FirestoreUnitOfWork(db),
  );
}

/**
 * Reservations still waiting on Documentation. `DeficiencyNoted` belongs here
 * rather than in a queue of its own: the buyer has 24 hours to cure it, and
 * the same reviewer picks it back up when they do.
 */
export const VERIFICATION_QUEUE: readonly ReservationStatus[] = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DeficiencyNoted',
];

/** Waiting on a supervisor. The final stage of the transaction (RBAC.xls). */
export const APPROVAL_QUEUE: readonly ReservationStatus[] = ['DocumentsVerified'];

export const RESERVATION_ACTIONS = [
  'verifyPayment',
  'verifyDocuments',
  'approve',
  'noteDeficiency',
  'markExpired',
] as const;
export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];

export function isReservationAction(value: string): value is ReservationAction {
  return (RESERVATION_ACTIONS as readonly string[]).includes(value);
}

export const ACTION_LABELS: Record<ReservationAction, string> = {
  verifyPayment: 'Verify payment',
  verifyDocuments: 'Verify documents',
  approve: 'Approve reservation',
  noteDeficiency: 'Note deficiency',
  markExpired: 'Mark expired',
};

/**
 * Which module gates each action.
 *
 * note.txt splits the approver three ways — "payment = billing, ID =
 * documentation, Final approval = Documentation Supervisor". Both halves of
 * the verification sit behind RESERVATION_VERIFICATION, which Documentation
 * and Billing now each hold; the roles differ, the module does not.
 *
 * Approval sits behind APPROVAL_MONITORING, and `can()` additionally requires
 * the supervisor flag for the `approve` permission — which is what narrows it
 * from "Documentation" to "a Documentation Supervisor".
 */
export function moduleFor(action: ReservationAction): Module {
  return action === 'approve' ? 'APPROVAL_MONITORING' : 'RESERVATION_VERIFICATION';
}

/**
 * Whether the buyer's 24-hour window has run out.
 *
 * Mirrors `Reservation.isDeficiencyOverdue`, from the flat row a screen has
 * rather than from the entity. The entity is still what refuses the
 * transition — this only decides whether to draw the button.
 */
export function isDeficiencyOverdue(
  reservation: { status: ReservationStatus; deficiencyDueAt: string | null },
  now: Date = new Date(),
): boolean {
  if (reservation.status !== 'DeficiencyNoted' || !reservation.deficiencyDueAt) return false;
  return now.getTime() > new Date(reservation.deficiencyDueAt).getTime();
}

/**
 * Which DESK owns each half of the verification.
 *
 * note.txt, twice over: "approver hati hatiin ang access — payment = billing,
 * ID = documentation", and then plainly — "ang pwede lang i-verify ni billing
 * ay payment at ang pwede lang din i-verify ni documentation ay document".
 *
 * ── Why the module grant cannot say this by itself ──────────────────────
 *
 * `verifyPayment` and `verifyDocuments` sit behind the same module,
 * RESERVATION_VERIFICATION, and both desks hold it with `modify` — Billing so
 * it can clear a payment, Documentation so it can accept the requirements.
 * That is all a module can express, and it granted each desk BOTH halves:
 * Billing could sign off an ID it never looked at, and Documentation could
 * clear a payment it cannot see a bank statement for.
 *
 * Splitting them needs a rule about roles, because the requirement is about
 * roles. This is that rule, and it is checked ON TOP of the module grant
 * rather than instead of it.
 *
 * `approve` and `noteDeficiency` are absent deliberately. Approval is narrowed
 * by the supervisor flag on APPROVAL_MONITORING, which only Documentation
 * holds with `modify`; noting a deficiency is something either desk may do
 * about its own half.
 */
const VERIFYING_DESK: Partial<Record<ReservationAction, readonly InternalRole[]>> = {
  verifyPayment: ['BILLING'],
  verifyDocuments: ['DOCUMENTATION'],
};

/**
 * Why an actor may not take an action.
 *
 * `canTakeAction` is the yes/no question and most callers want only that. The
 * detail screen wants the reason: "no button" and "no button BECAUSE you are
 * the one who signs this off" read identically to the person looking at it,
 * and the second is a deliberate design rather than a fault.
 */
export type ActionRefusal =
  /** The role holds no grant over the module at all. */
  | 'notGranted'
  /** The other desk owns this half of the verification. */
  | 'otherDesk'
  /** Allowed by desk, refused because this actor gives the final approval. */
  | 'approverMayNotVerify';

/**
 * The single authorisation question for a reservation action.
 *
 * Three gates: the module grant, the desk that owns the step, and — for the
 * two verifications — that the actor is not the person who will later sign the
 * reservation off. Every caller (the buttons, the queue table, the dashboards
 * and the server action) goes through here, so a screen cannot offer something
 * the action would refuse, and the action cannot accept something no screen
 * offered.
 *
 * Returns null when the actor MAY act. The reason and the verdict come from
 * this one function so a screen cannot explain a refusal that is not happening,
 * or stay silent about one that is.
 */
export function refusalFor(
  actor: InternalActor,
  action: ReservationAction,
): ActionRefusal | null {
  const permission = action === 'approve' ? 'approve' : 'modify';
  if (!can(actor, moduleFor(action), permission)) return 'notGranted';

  const desks = VERIFYING_DESK[action];
  if (desks === undefined) return null;
  if (!desks.includes(actor.role)) return 'otherDesk';

  /*
   * FOUR EYES — the approver may not also be a verifier.
   *
   * The client, ruling on the Documentation Supervisor: "hindi siya pwedeng
   * mag verify ng document, si staff lang." note.txt says the same thing in
   * the audit-trail section, where the two are named as different people —
   * "ilologs kung sinong STAFF ang nag verify, at kung sinong SUPERVISOR ang
   * nag approve".
   *
   * The desk rule above stops the other DEPARTMENT signing off your half. It
   * cannot stop one person doing both halves of the same department's chain,
   * and Documentation is the department where that matters: it verifies the
   * ID, and its supervisor gives the final approval. Nothing stopped that
   * supervisor doing both, and the record would have read as two clean
   * signatures — `documentsVerifiedBy` and `approvedBy` — with one person
   * behind them. The audit trail the client asked for would have logged the
   * fraud in full and flagged nothing.
   *
   * Phrased as "may this actor approve?" rather than "is this a Documentation
   * supervisor?" on purpose. The conflict IS the approval right, so the test
   * should name it — and the rule then keeps holding if approval is ever moved
   * to another role, instead of quietly protecting a department that no longer
   * signs anything.
   *
   * It deliberately leaves the Billing supervisor able to verify a payment:
   * Billing holds no APPROVAL_MONITORING grant, so verifying there ends the
   * desk's involvement and no second signature of theirs follows it.
   *
   * `noteDeficiency` and `markExpired` are outside this check — they return
   * above. Both are refusals, not approvals, and a supervisor who spots a bad
   * ID at final review needs to be able to send it back.
   */
  return can(actor, 'APPROVAL_MONITORING', 'approve') ? 'approverMayNotVerify' : null;
}

export function canTakeAction(actor: InternalActor, action: ReservationAction): boolean {
  return refusalFor(actor, action) === null;
}

/**
 * What this reservation will accept next.
 *
 * Driven by the two VERIFICATION TRACKS, not by the status. Under note.txt's
 * parallel model the status is derived from them, so a status-only table
 * cannot answer the question: `PendingPaymentVerification` means "payment
 * outstanding" and says nothing about whether Documentation has finished.
 *
 * It used to be that table, and it was wrong in a way nothing caught — from
 * `PendingPaymentVerification` it offered only `verifyPayment`, so
 * Documentation could never record a complete set of IDs until Billing had
 * gone first. The entity allowed it; the screen never drew the button.
 *
 * Still a deliberate restatement of the entity's rules rather than a second
 * source of truth: this decides which buttons to draw, and the entity decides
 * whether the transition happens. If they disagree the entity wins.
 */
export function actionsFor(reservation: {
  status: ReservationStatus;
  paymentVerifiedBy: string | null;
  documentsVerifiedBy: string | null;
  deficiencyDueAt?: string | null;
}): ReservationAction[] {
  // Everything from Approved onward, plus the two dead ends, is finished with.
  const open: readonly ReservationStatus[] = [
    'PendingPaymentVerification',
    'PaymentVerified',
    'DocumentsVerified',
    'DeficiencyNoted',
  ];
  if (!open.includes(reservation.status)) return [];

  const actions: ReservationAction[] = [];

  // A deficiency sends the record back to whichever desk raised it, so both
  // may act again even if they have already signed once.
  const curing = reservation.status === 'DeficiencyNoted';
  if (!reservation.paymentVerifiedBy || curing) actions.push('verifyPayment');
  if (!reservation.documentsVerifiedBy || curing) actions.push('verifyDocuments');

  // The supervisor's signature, offered only once both desks are done and no
  // deficiency is outstanding. The entity refuses otherwise regardless.
  if (reservation.status === 'DocumentsVerified') actions.push('approve');

  actions.push('noteDeficiency');

  /*
   * Expiry is offered ONLY once the window has actually lapsed, and only by
   * hand.
   *
   * RESERVATION.doc: "The system does not automatically cancel expired
   * reservations." Nothing was calling `markExpired` at all, so the 24-hour
   * clock was a number on a record that no code ever read — a deficiency sat
   * in the queue for ever and never reached the Expired Reservation Report.
   *
   * Expiring is NOT cancelling: it moves the reservation into the report, and
   * cancellation remains a separate act requiring a second person.
   */
  if (isDeficiencyOverdue({ status: reservation.status, deficiencyDueAt: reservation.deficiencyDueAt ?? null })) {
    actions.push('markExpired');
  }

  return actions;
}

/**
 * Statuses are stored in PascalCase because that is what the entity's state
 * machine compares against. Staff should not have to read machine identifiers,
 * so the display name is resolved here rather than by inserting spaces at the
 * capitals — "SOA" and "OCR" would come apart if it were done mechanically.
 */
export const STATUS_LABELS: Record<ReservationStatus, string> = {
  PendingPaymentVerification: 'Awaiting payment check',
  PaymentVerified: 'Payment verified',
  DocumentsVerified: 'Documents verified',
  Approved: 'Approved',
  ContractSigned: 'Contract signed',
  Completed: 'Completed',
  DeficiencyNoted: 'Deficiency noted',
  Expired: 'Expired',
  Cancelled: 'Cancelled',
};

/**
 * How far along the happy path a status sits, for the progress indicator.
 *
 * The three off-path statuses rank 0: a deficiency sends the application back
 * to the start of verification, and the entity does not record which stage
 * raised it — so claiming any further progress would be a guess.
 */
export const STAGE_LABELS = [
  'Submitted',
  'Payment verified',
  'Documents verified',
  'Approved',
] as const;

const STAGE_RANK: Record<ReservationStatus, number> = {
  PendingPaymentVerification: 0,
  DeficiencyNoted: 0,
  Expired: 0,
  Cancelled: 0,
  PaymentVerified: 1,
  DocumentsVerified: 2,
  Approved: 3,
  ContractSigned: 3,
  Completed: 3,
};

export function stageRank(status: ReservationStatus): number {
  return STAGE_RANK[status];
}

/** Statuses that mean the application has left the happy path. */
export function isOffTrack(status: ReservationStatus): boolean {
  return status === 'DeficiencyNoted' || status === 'Expired' || status === 'Cancelled';
}

/**
 * Who the reservation is waiting on next.
 *
 * The RBAC split means a reviewer regularly opens a record they can no longer
 * act on — Documentation hands over to an Account Receivables supervisor at
 * approval, and the screen went quiet at exactly that point. Naming the next
 * desk is the difference between "this is finished with me" and "this is
 * broken".
 */
export function waitingOn(
  status: ReservationStatus,
  tracks: { paymentVerifiedBy?: string | null; documentsVerifiedBy?: string | null } = {},
): string | null {
  switch (status) {
    /*
     * Both of these mean "still in verification", and the status alone cannot
     * say which desk is holding it up: under the parallel model the two tracks
     * run independently, and `PendingPaymentVerification` reports only that
     * payment is outstanding — Documentation may well have finished.
     *
     * So the tracks are read directly. It used to name Documentation for both
     * halves, which was left over from when Documentation owned the whole
     * verification, and told a reviewer to chase the wrong desk about a
     * payment Documentation is no longer allowed to touch.
     */
    case 'PendingPaymentVerification':
    case 'PaymentVerified': {
      const outstanding = [
        tracks.paymentVerifiedBy ? null : 'Billing, to verify the payment',
        tracks.documentsVerifiedBy ? null : 'Documentation, to verify the documentary requirements',
      ].filter((part): part is string => part !== null);
      // Empty only if the row contradicts itself — both tracks signed while the
      // status still says otherwise. Say nothing rather than invent a desk.
      return outstanding.length > 0 ? outstanding.join('; and ') : null;
    }
    // note.txt: "Final approval = Documentation Supervisor". This named an
    // Account Receivables supervisor, which was true under RBAC.xls and stopped
    // being true when the client split the approver three ways — AR now watches
    // this queue read-only and cannot sign anything in it.
    case 'DocumentsVerified':
      return 'a Documentation Supervisor, who gives final approval from Approval Monitoring';
    case 'DeficiencyNoted':
      return 'the buyer, who has 24 hours to respond to the deficiency';
    case 'Approved':
      return 'the buyer, to sign the Contract to Sell';
    case 'ContractSigned':
      return 'Documentation, to activate the Permanent Client Account';
    default:
      return null;
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

export function formatCentavos(centavos: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    centavos / 100,
  );
}
