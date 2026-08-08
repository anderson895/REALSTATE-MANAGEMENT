import { describe, expect, it } from 'vitest';
import { actionsFor } from '../lib/reservations';

/**
 * `actionsFor` decides which buttons a reviewer sees.
 *
 * It used to switch on the STATUS alone, which silently broke the parallel
 * model note.txt asks for: from `PendingPaymentVerification` it offered only
 * `verifyPayment`, so Documentation could never record a finished set of IDs
 * until Billing had gone first. Every domain test passed — the entity allowed
 * it, the screen just never drew the button.
 */
const row = (over: Partial<Parameters<typeof actionsFor>[0]> = {}) => ({
  status: 'PendingPaymentVerification' as const,
  paymentVerifiedBy: null,
  documentsVerifiedBy: null,
  ...over,
});

describe('actionsFor', () => {
  it('offers BOTH desks on a fresh reservation', () => {
    const actions = actionsFor(row());
    expect(actions).toContain('verifyPayment');
    expect(actions).toContain('verifyDocuments');
    expect(actions).not.toContain('approve');
  });

  it('drops a desk once it has signed', () => {
    const actions = actionsFor(row({ status: 'PaymentVerified', paymentVerifiedBy: 'EMP014' }));
    expect(actions).not.toContain('verifyPayment');
    expect(actions).toContain('verifyDocuments');
  });

  it('handles documents finishing first', () => {
    // The case the old status-only table could not represent at all.
    const actions = actionsFor(row({ documentsVerifiedBy: 'EMP012' }));
    expect(actions).toContain('verifyPayment');
    expect(actions).not.toContain('verifyDocuments');
    expect(actions).not.toContain('approve');
  });

  it('offers approval only when both are done', () => {
    const actions = actionsFor(
      row({
        status: 'DocumentsVerified',
        paymentVerifiedBy: 'EMP014',
        documentsVerifiedBy: 'EMP012',
      }),
    );
    expect(actions).toContain('approve');
  });

  it('reopens both desks while a deficiency is being cured', () => {
    const actions = actionsFor(
      row({
        status: 'DeficiencyNoted',
        paymentVerifiedBy: 'EMP014',
        documentsVerifiedBy: 'EMP012',
      }),
    );
    expect(actions).toContain('verifyPayment');
    expect(actions).toContain('verifyDocuments');
    // Not approvable until the deficiency clears.
    expect(actions).not.toContain('approve');
  });

  it('offers nothing once the reservation is finished with', () => {
    for (const status of ['Approved', 'ContractSigned', 'Completed', 'Expired', 'Cancelled'] as const) {
      expect(actionsFor(row({ status })), status).toEqual([]);
    }
  });
});

/**
 * The 24-hour deficiency window.
 *
 * `markExpired` existed on the entity and on the workflow, with a guard that
 * refuses an early expiry — and nothing anywhere called it. The clock was a
 * number written to a record that no code ever read, so a deficiency sat in
 * the queue for ever and never reached the Expired Reservation Report.
 */
describe('expiring a lapsed deficiency', () => {
  const noted = (dueAt: string) => ({
    status: 'DeficiencyNoted' as const,
    paymentVerifiedBy: null,
    documentsVerifiedBy: null,
    deficiencyDueAt: dueAt,
  });

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  it('is not offered while the buyer still has time', () => {
    expect(actionsFor(noted(hoursFromNow(6)))).not.toContain('markExpired');
  });

  it('is offered once the window has lapsed', () => {
    expect(actionsFor(noted(hoursFromNow(-1)))).toContain('markExpired');
  });

  it('is never offered on a reservation with no deficiency', () => {
    expect(
      actionsFor({
        status: 'PendingPaymentVerification',
        paymentVerifiedBy: null,
        documentsVerifiedBy: null,
        deficiencyDueAt: null,
      }),
    ).not.toContain('markExpired');
  });

  it('still lets either desk cure it after the window', () => {
    // Expiring is a choice, not a deadline that slams shut. A buyer who turns
    // up on day two with the right ID can still be put through.
    const actions = actionsFor(noted(hoursFromNow(-48)));
    expect(actions).toContain('verifyPayment');
    expect(actions).toContain('verifyDocuments');
  });
});
