import { describe, expect, it } from 'vitest';
import {
  DEFICIENCY_CURE_HOURS,
  DOCUMENT_SUBMISSION_DAYS,
  RESERVATION_STATUSES,
  Reservation,
  isVisibleToSales,
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
const BILLING = new EmployeeId('EMP014');

/**
 * Rebuilds a reservation in a CONSISTENT state.
 *
 * The two verification tracks are the source of truth and `status` is derived
 * from them, so a fixture cannot just assert a status any more — reconstituting
 * "DocumentsVerified" with neither track recorded would produce a reservation
 * the entity itself could never have reached, and the first call on it would
 * derive its way back to Pending.
 *
 * These are the states that are actually reachable:
 *   PendingPaymentVerification — neither track, OR documents only
 *   PaymentVerified            — payment only
 *   DocumentsVerified          — both, waiting on a supervisor
 */
function makeReservation(
  status: ReservationStatus = 'PendingPaymentVerification',
  tracks?: { payment?: boolean; documents?: boolean },
): Reservation {
  const payment = tracks?.payment ?? ['PaymentVerified', 'DocumentsVerified'].includes(status);
  const documents = tracks?.documents ?? status === 'DocumentsVerified';

  // Everything from Approved onward has necessarily been through both.
  const past = ['Approved', 'ContractSigned', 'Completed'].includes(status);

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
    paymentVerified: payment || past ? { by: BILLING, at: AT } : null,
    documentsVerified: documents || past ? { by: STAFF, at: AT } : null,
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

  /**
   * The gate note.txt asks for: "maapprove niya lang final kung approve na ng
   * billing and documentation".
   *
   * Now a BusinessRuleViolationError rather than an IllegalStateTransitionError.
   * The status machine alone can no longer catch this — with the tracks
   * parallel, `approve` is refused because the WORK is unfinished, not because
   * the status is wrong — and the message has to name which desk is missing so
   * the supervisor knows who to chase.
   */
  it('refuses approval until both desks have finished', () => {
    const r = makeReservation();
    expect(() => r.approve(SUPERVISOR, true, AT)).toThrow(BusinessRuleViolationError);
    expect(() => r.approve(SUPERVISOR, true, AT)).toThrow(/payment \(Billing\)/);
    expect(() => r.approve(SUPERVISOR, true, AT)).toThrow(/Documentation/);
    expect(r.status).toBe('PendingPaymentVerification');
  });

  it('still refuses when only one desk has finished', () => {
    const paymentOnly = makeReservation('PaymentVerified');
    expect(() => paymentOnly.approve(SUPERVISOR, true, AT)).toThrow(/documentary requirements/);

    // Documents done, payment outstanding — the case the old sequential chain
    // could not represent at all.
    const documentsOnly = makeReservation('PendingPaymentVerification', { documents: true });
    expect(() => documentsOnly.approve(SUPERVISOR, true, AT)).toThrow(/payment \(Billing\)/);
  });

  it('lets the two desks finish in either order', () => {
    const documentsFirst = makeReservation();
    documentsFirst.verifyDocuments(STAFF, AT);
    expect(documentsFirst.status).toBe('PendingPaymentVerification');
    documentsFirst.verifyPayment(BILLING, AT);
    expect(documentsFirst.status).toBe('DocumentsVerified');
    expect(documentsFirst.isFullyVerified).toBe(true);

    const paymentFirst = makeReservation();
    paymentFirst.verifyPayment(BILLING, AT);
    paymentFirst.verifyDocuments(STAFF, AT);
    expect(paymentFirst.status).toBe('DocumentsVerified');
  });

  it('records who verified each half', () => {
    const r = makeReservation();
    r.verifyPayment(BILLING, AT);
    r.verifyDocuments(STAFF, AT);

    // note.txt: "ilologs kung sinong staff ang nag verify".
    expect(r.paymentVerified?.by.value).toBe(BILLING.value);
    expect(r.documentsVerified?.by.value).toBe(STAFF.value);
  });

  it('refuses to verify the same half twice', () => {
    const r = makeReservation();
    r.verifyPayment(BILLING, AT);
    // Silently overwriting would lose the name of whoever actually did it.
    expect(() => r.verifyPayment(SUPERVISOR, AT)).toThrow(BusinessRuleViolationError);
    expect(r.paymentVerified?.by.value).toBe(BILLING.value);
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

    // Back to pending PAYMENT, not to DocumentsVerified: the documents are now
    // in order but Billing has still not cleared the fee, and the headline
    // names what the reservation is waiting for.
    expect(r.status).toBe('PendingPaymentVerification');
    expect(r.documentsVerified?.by.value).toBe(STAFF.value);
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

/** Terminal: every call is refused. */
const FROZEN: Record<ReservationStatus, 'THROWS'> = {
  PendingPaymentVerification: 'THROWS',
  PaymentVerified: 'THROWS',
  DocumentsVerified: 'THROWS',
  Approved: 'THROWS',
  ContractSigned: 'THROWS',
  Completed: 'THROWS',
  DeficiencyNoted: 'THROWS',
  Expired: 'THROWS',
  Cancelled: 'THROWS',
};

describe('Reservation — exhaustive transition matrix', () => {
  /*
   * Transcribed from the SPECIFICATION rather than read from the entity, so
   * this disagrees with the implementation if the two ever drift.
   *
   * ── Why this is a result table and not a from -> to matrix ──────────────
   *
   * It used to be: legal moves listed per status, everything else throws. That
   * shape assumed `status` WAS the state. Under note.txt's parallel tracks it
   * is derived from them, so the same call produces different statuses
   * depending on what the other desk has already done — verifying documents
   * lands on DocumentsVerified if Billing is finished, and leaves the status
   * on PendingPaymentVerification if it is not.
   *
   * So each cell states what the call ACTUALLY produces: a status, or THROWS.
   * `makeReservation` supplies tracks consistent with `from`, which is what
   * makes each row deterministic.
   */
  const THROWS = 'THROWS' as const;
  type Outcome = ReservationStatus | typeof THROWS;

  const RESULT: Record<ReservationStatus, Record<ReservationStatus, Outcome>> = {
    // Neither track recorded yet.
    PendingPaymentVerification: {
      PaymentVerified: 'PaymentVerified',
      // Legal, and real work — but payment is still outstanding, so the
      // headline stays put.
      DocumentsVerified: 'PendingPaymentVerification',
      DeficiencyNoted: 'DeficiencyNoted',
      Approved: THROWS,
      ContractSigned: THROWS,
      Completed: THROWS,
      Expired: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    // Billing done, Documentation outstanding.
    PaymentVerified: {
      DocumentsVerified: 'DocumentsVerified',
      DeficiencyNoted: 'DeficiencyNoted',
      // Already recorded — a second verification is refused rather than
      // silently overwriting who did it.
      PaymentVerified: THROWS,
      Approved: THROWS,
      ContractSigned: THROWS,
      Completed: THROWS,
      Expired: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    // Both done — the only state a supervisor may sign.
    DocumentsVerified: {
      Approved: 'Approved',
      DeficiencyNoted: 'DeficiencyNoted',
      PaymentVerified: THROWS,
      DocumentsVerified: THROWS,
      ContractSigned: THROWS,
      Completed: THROWS,
      Expired: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    Approved: {
      ContractSigned: 'ContractSigned',
      PaymentVerified: THROWS,
      DocumentsVerified: THROWS,
      Approved: THROWS,
      Completed: THROWS,
      DeficiencyNoted: THROWS,
      Expired: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    ContractSigned: {
      Completed: 'Completed',
      PaymentVerified: THROWS,
      DocumentsVerified: THROWS,
      Approved: THROWS,
      ContractSigned: THROWS,
      DeficiencyNoted: THROWS,
      Expired: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    // Curing a deficiency re-runs whichever track raised it. The fixture has
    // neither recorded, so documents alone returns it to pending payment.
    DeficiencyNoted: {
      PaymentVerified: 'PaymentVerified',
      DocumentsVerified: 'PendingPaymentVerification',
      Expired: 'Expired',
      Approved: THROWS,
      ContractSigned: THROWS,
      Completed: THROWS,
      DeficiencyNoted: THROWS,
      Cancelled: THROWS,
      PendingPaymentVerification: THROWS,
    },
    Expired: {
      Cancelled: 'Cancelled',
      PaymentVerified: THROWS,
      DocumentsVerified: THROWS,
      Approved: THROWS,
      ContractSigned: THROWS,
      Completed: THROWS,
      DeficiencyNoted: THROWS,
      Expired: THROWS,
      PendingPaymentVerification: THROWS,
    },
    Cancelled: FROZEN,
    Completed: FROZEN,
  };

  const attempt: Record<ReservationStatus, (r: Reservation) => void> = {
    PaymentVerified: (r) => r.verifyPayment(BILLING, AT),
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
      const expected = RESULT[from][to];

      const label =
        expected === THROWS
          ? 'THROWS'
          : expected === from
            ? 'is accepted but does not move'
            : `-> ${expected}`;

      it(`${from} + ${to} ${label}`, () => {
        const r = makeReservation(from);
        const run = () => attempt[to](r);

        if (expected === THROWS) {
          expect(run).toThrow();
          expect(r.status, 'status must be unchanged after a rejected move').toBe(from);
        } else {
          run();
          expect(r.status).toBe(expected);
        }
      });
    }
  }
});

/**
 * note.txt: "si sales agent hindi makaka receieved ng verification —
 * marerecieved lang ni sales agent kapag verified na lahat sa billing,
 * documentation, Documentation Supervisor."
 *
 * Exhaustive over every status, so a status added later has to be classified
 * deliberately instead of defaulting into the agent's view.
 */
describe('what a Sales Agent may see', () => {
  const VISIBLE: readonly ReservationStatus[] = ['Approved', 'ContractSigned', 'Completed'];

  for (const status of RESERVATION_STATUSES) {
    const expected = VISIBLE.includes(status);
    it(`${status} is ${expected ? 'visible' : 'HIDDEN'} to Sales`, () => {
      expect(isVisibleToSales(status)).toBe(expected);
    });
  }

  it('hides everything that is still being verified', () => {
    // The whole point: no half-cleared payment, no deficiency and no reason
    // for one reaches the agent who sold the unit.
    expect(isVisibleToSales('PendingPaymentVerification')).toBe(false);
    expect(isVisibleToSales('PaymentVerified')).toBe(false);
    expect(isVisibleToSales('DocumentsVerified')).toBe(false);
    expect(isVisibleToSales('DeficiencyNoted')).toBe(false);
  });

  it('opens up exactly at the supervisor signature', () => {
    const r = makeReservation('DocumentsVerified');
    expect(isVisibleToSales(r.status)).toBe(false);
    r.approve(SUPERVISOR, true, AT);
    expect(isVisibleToSales(r.status)).toBe(true);
  });
});

/**
 * A deficiency raised AFTER both desks finished used to be a dead end.
 *
 * Both flags were set, so neither desk could act again; `Approved` is not
 * reachable from `DeficiencyNoted`, so the supervisor could not sign either.
 * The only remaining move was expiry — on a problem the buyer has 24 hours to
 * fix. Re-verification while curing is what reopens it.
 */
describe('curing a deficiency raised after both desks finished', () => {
  it('lets the desk that raised it verify again', () => {
    const r = makeReservation('DocumentsVerified');
    expect(r.isFullyVerified).toBe(true);

    r.noteDeficiency('ID photo does not match the TIN', STAFF, AT);
    expect(r.status).toBe('DeficiencyNoted');

    // Already recorded once, and allowed through anyway because the record is
    // being cured. Curing CLEARS the deficiency, which returns the reservation
    // to fully verified in one step — the other desk's signature never lapsed.
    r.verifyDocuments(STAFF, AT);

    expect(r.status).toBe('DocumentsVerified');
    expect(r.deficiencyReason).toBeNull();
    expect(r.isFullyVerified).toBe(true);
  });

  it('offers the other desk too, in case the deficiency was theirs', () => {
    const r = makeReservation('DocumentsVerified');
    r.noteDeficiency('payment reference does not match the receipt', STAFF, AT);

    // Whichever desk owns the problem may act; only one of them needs to.
    r.verifyPayment(BILLING, AT);
    expect(r.status).toBe('DocumentsVerified');
    expect(r.paymentVerified?.by.value).toBe(BILLING.value);
  });

  it('can be approved again once cured', () => {
    const r = makeReservation('DocumentsVerified');
    r.noteDeficiency('blurred ID', STAFF, AT);
    r.verifyDocuments(STAFF, AT);
    r.approve(SUPERVISOR, true, AT);
    expect(r.status).toBe('Approved');
  });

  it('still refuses a second verification when there is no deficiency', () => {
    const r = makeReservation();
    r.verifyPayment(BILLING, AT);
    expect(() => r.verifyPayment(SUPERVISOR, AT)).toThrow(BusinessRuleViolationError);
  });
});
