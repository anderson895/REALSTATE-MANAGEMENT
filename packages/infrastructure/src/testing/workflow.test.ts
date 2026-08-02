import { beforeEach, describe, expect, it } from 'vitest';
import {
  BusinessRuleViolationError,
  ClientId,
  EmployeeId,
  Money,
  ProjectId,
  ReservationWorkflowService,
  Unit,
  UnitId,
  UnitNotAvailableError,
  type ReservationTerms,
} from '@sfsr/domain';
import {
  InMemoryAuditLogger,
  InMemoryReservationRepository,
  InMemoryUnitOfWork,
  InMemoryUnitRepository,
} from './in-memory';

const AT = new Date('2026-08-02T10:00:00Z');
const CLIENT = new ClientId('client-uid-001');
const OTHER_CLIENT = new ClientId('client-uid-002');
const STAFF = new EmployeeId('EMP012');
const SUPERVISOR = new EmployeeId('EMP011');
const TERMS: ReservationTerms = {
  downPaymentTier: 30,
  paymentTerm: 24,
  financingOption: 'Bank Financing',
};

function makeUnit(id = 'U001'): Unit {
  return Unit.create({
    id: new UnitId(id),
    projectId: new ProjectId('TLP001'),
    tower: null,
    floor: 1,
    unitNo: 'A-101',
    unitType: 'Studio',
    areaSqm: 24,
    pricePerSqm: Money.fromPesos(250_000),
    purchasePrice: Money.fromPesos(6_000_000),
  });
}

describe('ReservationWorkflowService', () => {
  let units: InMemoryUnitRepository;
  let reservations: InMemoryReservationRepository;
  let audit: InMemoryAuditLogger;
  let workflow: ReservationWorkflowService;

  beforeEach(() => {
    units = new InMemoryUnitRepository().seed(makeUnit());
    reservations = new InMemoryReservationRepository();
    audit = new InMemoryAuditLogger();
    workflow = new ReservationWorkflowService(units, reservations, audit, new InMemoryUnitOfWork());
  });

  const submit = (clientId = CLIENT) =>
    workflow.submit({
      clientId,
      unitId: new UnitId('U001'),
      parkingSlotId: null,
      salesAgentId: 'AG001',
      terms: TERMS,
      at: AT,
    });

  it('issues a RES-YYYY-NNNNNN reference on submission', async () => {
    const number = await submit();
    expect(number.value).toBe('RES-2026-000001');
    expect(number.year).toBe(2026);
  });

  it('does NOT hold the unit at submission — the hold follows payment verification', async () => {
    await submit();
    const unit = await units.findById(new UnitId('U001'));
    expect(unit?.status).toBe('Available');
  });

  it('holds the unit once Account Receivables verifies the fee', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);

    const unit = await units.findById(new UnitId('U001'));
    expect(unit?.status).toBe('On Hold');
    expect(unit?.currentReservation?.value).toBe(number.value);
  });

  it('refuses a second reservation on a held unit', async () => {
    const first = await submit();
    await workflow.verifyPayment(first, STAFF, AT);

    await expect(submit(OTHER_CLIENT)).rejects.toThrow(BusinessRuleViolationError);
  });

  it('rejects payment verification if the unit was taken in between', async () => {
    const first = await submit(CLIENT);
    const second = await submit(OTHER_CLIENT); // both submitted while Available

    await workflow.verifyPayment(first, STAFF, AT);
    // The unit is now held by the first reservation.
    await expect(workflow.verifyPayment(second, STAFF, AT)).rejects.toThrow(UnitNotAvailableError);
  });

  it('marks the unit Sold on supervisor approval', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);
    await workflow.verifyDocuments(number, STAFF, AT);
    await workflow.approve(number, SUPERVISOR, true, AT);

    const unit = await units.findById(new UnitId('U001'));
    expect(unit?.status).toBe('Sold');
    expect((await reservations.findByNumber(number))?.status).toBe('Approved');
  });

  it('refuses approval by a non-supervisor and leaves the unit untouched', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);
    await workflow.verifyDocuments(number, STAFF, AT);

    await expect(workflow.approve(number, STAFF, false, AT)).rejects.toThrow(
      BusinessRuleViolationError,
    );
    expect((await units.findById(new UnitId('U001')))?.status).toBe('On Hold');
  });

  it('will not expire a reservation before its deficiency deadline', async () => {
    const number = await submit();
    await workflow.noteDeficiency(number, 'blurred ID', STAFF, AT);

    const withinWindow = new Date(AT.getTime() + 12 * 3_600_000);
    await expect(workflow.markExpired(number, withinWindow)).rejects.toThrow(
      BusinessRuleViolationError,
    );
  });

  it('expires after the window but keeps the unit held — expiry is not cancellation', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);
    await workflow.noteDeficiency(number, 'missing TIN', STAFF, AT);

    const afterWindow = new Date(AT.getTime() + 25 * 3_600_000);
    await workflow.markExpired(number, afterWindow);

    expect((await reservations.findByNumber(number))?.status).toBe('Expired');
    expect((await units.findById(new UnitId('U001')))?.status).toBe('On Hold');
  });

  it('returns the unit to Available only after a two-person cancellation', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);
    await workflow.noteDeficiency(number, 'no documents', STAFF, AT);
    const afterWindow = new Date(AT.getTime() + 25 * 3_600_000);
    await workflow.markExpired(number, afterWindow);

    await expect(
      workflow.cancel(number, STAFF, STAFF, 'no documents', afterWindow),
    ).rejects.toThrow(BusinessRuleViolationError);

    await workflow.cancel(number, STAFF, SUPERVISOR, 'no documents', afterWindow);

    const unit = await units.findById(new UnitId('U001'));
    expect(unit?.status).toBe('Available');
    expect(unit?.currentReservation).toBeNull();
    expect((await reservations.findByNumber(number))?.status).toBe('Cancelled');
  });

  it('writes an audit entry for every state change', async () => {
    const number = await submit();
    await workflow.verifyPayment(number, STAFF, AT);
    await workflow.verifyDocuments(number, STAFF, AT);
    await workflow.approve(number, SUPERVISOR, true, AT);

    expect(audit.types()).toEqual([
      'reservation.submitted',
      'reservation.paymentVerified',
      'unit.held',
      'reservation.documentsVerified',
      'reservation.approved',
      'unit.sold',
    ]);
    expect(audit.entries.at(-1)?.actor).toBe('EMP011');
  });

  it('rejects a reservation for a unit that does not exist', async () => {
    await expect(
      workflow.submit({
        clientId: CLIENT,
        unitId: new UnitId('U999'),
        parkingSlotId: null,
        salesAgentId: null,
        terms: TERMS,
        at: AT,
      }),
    ).rejects.toThrow(BusinessRuleViolationError);
  });
});
