import {
  ReservationWorkflowService,
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
};

/**
 * Approval is monitored by a different department than verification, so the
 * two actions sit behind different modules in the RBAC matrix.
 */
export function moduleFor(action: ReservationAction): Module {
  return action === 'approve' ? 'APPROVAL_MONITORING' : 'RESERVATION_VERIFICATION';
}

/**
 * What this status will accept next.
 *
 * A deliberate restatement of `Reservation.ALLOWED`, not a second source of
 * truth: this decides which buttons to draw, and the entity decides whether
 * the transition happens. If the two ever disagree the entity wins and the
 * reviewer sees an IllegalStateTransitionError, which is the safe direction
 * for them to disagree in.
 */
export function actionsFor(status: ReservationStatus): ReservationAction[] {
  switch (status) {
    case 'PendingPaymentVerification':
      return ['verifyPayment', 'noteDeficiency'];
    case 'PaymentVerified':
      return ['verifyDocuments', 'noteDeficiency'];
    case 'DocumentsVerified':
      return ['approve', 'noteDeficiency'];
    // Curing a deficiency re-enters the flow at whichever stage raised it.
    case 'DeficiencyNoted':
      return ['verifyPayment', 'verifyDocuments'];
    default:
      return [];
  }
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
export function waitingOn(status: ReservationStatus): string | null {
  switch (status) {
    case 'PendingPaymentVerification':
    case 'PaymentVerified':
      return 'Documentation, to verify the payment and the documentary requirements';
    case 'DocumentsVerified':
      return 'an Account Receivables supervisor, who gives final approval from Approval Monitoring';
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
