import { describe, expect, it } from 'vitest';
import {
  DEFICIENCY_CURE_HOURS,
  DOCUMENT_SUBMISSION_DAYS,
  RESERVATION_STATUSES,
  Reservation,
  type ReservationStatus,
} from './reservation';
import { ClientId, EmployeeId, ReservationNumber, UnitId } from '../value-objects/identifiers';
import { BusinessRuleViolationError, IllegalStateTransitionError } from '../errors';

const AT = new Date('2026-08-02T10:00:00Z');
const NUMBER = ReservationNumber.create(2026, 1);
const CLIENT = new ClientId('client-uid-001');
const UNIT = new UnitId('U001');
const STAFF = new EmployeeId('EMP012');
const SUPERVISOR = new EmployeeId('EMP011');

function makeReservation(status: ReservationStatus = 'PendingPaymentVerification'): Reservation {
  return Reservation.reconstitute({
    number: NUMBER,
    clientId: CLIENT,
    unitId: UNIT,
    parkingSlotId: null,
    salesAgentId: 'AG001',
    terms: { downPaymentTier: 30, paymentTerm: 24, financingOption: 'Bank Financing' },
    reservedAt: AT,
    status,
    deficiencyDueAt: status === 'DeficiencyNoted' ? new Date(AT.getTime() + 86_400_000) : null,
    deficiencyReason: status === 'DeficiencyNoted' ? 'blurred ID' : null,
  });
}

describe('Reservation — submission', () => {
  it('starts pending payment verification and emits a submitted event', () => {
    const r = Reservation.create({
      number: NUMBER,
      clientId: CLIENT,
      unitId: UNIT,
      parkingSlotId: null,
      salesAgentId: 'AG001',
      terms: { downPaymentTier: 30, paymentTerm: 24, financingOption: 'Bank Financing' },
      reservedAt: AT,
    });
    expect(r.status).toBe('PendingPaymentVerification');
    expect(r.pullEvents().map((e) => e.type)).toEqual(['reservation.submitted']);
  });

  it('gives the buyer 30 calendar days for documentary requirements', () => {
    const r = makeReservation();
    const days = (r.documentDeadline.getTime() - AT.getTime()) / 86_400_000;
    expect(days).toBe(DOCUMENT_SUBMISSION_DAYS);
  });
});

describe('Reservation — the approval path', () => {
  it('walks submission through to a permanent client account', () => {
    const r = makeReservation();

    r.verifyPayment(STAFF, AT);
    expect(r.status).toBe('PaymentVerified');

    r.verifyDocuments(STAFF, AT);
    expect(r.status).toBe('DocumentsVerified');

    r.approve(SUPERVISOR, true, AT);
    expect(r.status).toBe('Approved');

    r.signContract(AT);
    expect(r.status).toBe('ContractSigned');

    r.activatePermanentAccount(STAFF, AT);
    expect(r.status).toBe('Completed');
    expect(r.isTerminal()).toBe(true);

    expect(r.pullEvents().map((e) => e.type)).toEqual([
      'reservation.paymentVerified',
      'reservation.documentsVerified',
      'reservation.approved',
      'reservation.contractSigned',
      'reservation.permanentAccountActivated',
    ]);
  });

  it('refuses approval by a non-supervisor', () => {
    const r = makeReservation('DocumentsVerified');
    expect(() => r.approve(STAFF, false, AT)).toThrow(BusinessRuleViolationError);
    expect(r.status).toBe('DocumentsVerified');
  });

  it('cannot jump from submission straight to approved', () => {
    const r = makeReservation();
    expect(() => r.approve(SUPERVISOR, true, AT)).toThrow(IllegalStateTransitionError);
    expect(r.status).toBe('PendingPaymentVerification');
  });
});

describe('Reservation — deficiencies', () => {
  it('opens a 24-hour cure window', () => {
    const r = makeReservation();
    r.noteDeficiency('proof of payment unreadable', STAFF, AT);

    expect(r.status).toBe('DeficiencyNoted');
    expect(r.deficiencyReason).toBe('proof of payment unreadable');
    const hours = (r.deficiencyDueAt!.getTime() - AT.getTime()) / 3_600_000;
    expect(hours).toBe(DEFICIENCY_CURE_HOURS);
  });

  it('requires a stated reason', () => {
    const r = makeReservation();
    expect(() => r.noteDeficiency('   ', STAFF, AT)).toThrow(BusinessRuleViolationError);
  });

  it('is not overdue inside the window and is overdue after it', () => {
    const r = makeReservation();
    r.noteDeficiency('missing TIN', STAFF, AT);

    expect(r.isDeficiencyOverdue(new Date(AT.getTime() + 23 * 3_600_000))).toBe(false);
    expect(r.isDeficiencyOverdue(new Date(AT.getTime() + 25 * 3_600_000))).toBe(true);
  });

  it('clears the deficiency once the buyer complies', () => {
    const r = makeReservation();
    r.noteDeficiency('missing TIN', STAFF, AT);
    r.verifyDocuments(STAFF, AT);

    expect(r.status).toBe('DocumentsVerified');
    expect(r.deficiencyDueAt).toBeNull();
    expect(r.deficiencyReason).toBeNull();
  });
});

describe('Reservation — expiry and cancellation', () => {
  it('expiry does NOT cancel — it only lands in the report', () => {
    const r = makeReservation('DeficiencyNoted');
    r.markExpired(AT);

    expect(r.status).toBe('Expired');
    expect(r.status).not.toBe('Cancelled');
    expect(r.isTerminal()).toBe(false); // still awaiting a human decision
  });

  it('cancels only from Expired', () => {
    for (const status of ['PendingPaymentVerification', 'PaymentVerified', 'Approved'] as const) {
      const r = makeReservation(status);
      expect(() => r.cancel(STAFF, SUPERVISOR, 'no payment', AT)).toThrow(
        BusinessRuleViolationError,
      );
      expect(r.status).toBe(status);
    }
  });

  it('requires a second person to approve the cancellation', () => {
    const r = makeReservation('Expired');
    expect(() => r.cancel(STAFF, STAFF, 'no payment', AT)).toThrow(BusinessRuleViolationError);
    expect(r.status).toBe('Expired');
  });

  it('requires a stated reason', () => {
    const r = makeReservation('Expired');
    expect(() => r.cancel(STAFF, SUPERVISOR, '  ', AT)).toThrow(BusinessRuleViolationError);
  });

  it('records who cancelled and who approved it', () => {
    const r = makeReservation('Expired');
    r.cancel(STAFF, SUPERVISOR, 'no documents submitted', AT);

    expect(r.status).toBe('Cancelled');
    expect(r.isTerminal()).toBe(true);

    const [event] = r.pullEvents();
    expect(event?.type).toBe('reservation.cancelled');
    expect(event?.payload).toMatchObject({
      cancelledBy: 'EMP012',
      approvedBy: 'EMP011',
      reason: 'no documents submitted',
    });
  });
});

describe('Reservation — exhaustive transition matrix', () => {
  // Transcribed independently from Development Plan.md §8.4 rather than read
  // from the entity, so this asserts the specification, not the implementation.
  const SPEC: Record<ReservationStatus, readonly ReservationStatus[]> = {
    PendingPaymentVerification: ['PaymentVerified', 'DeficiencyNoted'],
    PaymentVerified: ['DocumentsVerified', 'DeficiencyNoted'],
    DocumentsVerified: ['Approved', 'DeficiencyNoted'],
    Approved: ['ContractSigned'],
    ContractSigned: ['Completed'],
    DeficiencyNoted: ['PaymentVerified', 'DocumentsVerified', 'Expired'],
    Expired: ['Cancelled'],
    Cancelled: [],
    Completed: [],
  };

  const attempt: Record<ReservationStatus, (r: Reservation) => void> = {
    PaymentVerified: (r) => r.verifyPayment(STAFF, AT),
    DocumentsVerified: (r) => r.verifyDocuments(STAFF, AT),
    Approved: (r) => r.approve(SUPERVISOR, true, AT),
    ContractSigned: (r) => r.signContract(AT),
    Completed: (r) => r.activatePermanentAccount(STAFF, AT),
    DeficiencyNoted: (r) => r.noteDeficiency('reason', STAFF, AT),
    Expired: (r) => r.markExpired(AT),
    Cancelled: (r) => r.cancel(STAFF, SUPERVISOR, 'reason', AT),
    PendingPaymentVerification: () => {
      throw new IllegalStateTransitionError('any', 'PendingPaymentVerification');
    },
  };

  for (const from of RESERVATION_STATUSES) {
    for (const to of RESERVATION_STATUSES) {
      const legal = SPEC[from].includes(to);

      it(`${from} -> ${to} ${legal ? 'is allowed' : 'THROWS'}`, () => {
        const r = makeReservation(from);
        const run = () => attempt[to](r);

        if (legal) {
          run();
          expect(r.status).toBe(to);
        } else {
          expect(run).toThrow();
          expect(r.status, 'status must be unchanged after a rejected move').toBe(from);
        }
      });
    }
  }
});
