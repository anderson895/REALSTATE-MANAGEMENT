import { describe, expect, it } from 'vitest';
import { RESERVATION_STATUSES, type ReservationStatus } from './reservation';
import { canRequestWithdrawal } from './withdrawal';

describe('canRequestWithdrawal', () => {
  /*
   * An exhaustive map, not a list of the allowed ones.
   *
   * Adding a status to the domain FAILS the coverage test below until someone
   * decides what withdrawal means for it. A permissive default would let a new
   * status through silently, and the wrong default here hands a buyer a button
   * that forfeits ₱50,000.
   */
  const SPEC: Record<ReservationStatus, boolean> = {
    PendingPaymentVerification: true,
    PaymentVerified: true,
    DocumentsVerified: true,
    DeficiencyNoted: true,
    // Contract preparation has begun — this becomes a conversation, not a form.
    Approved: false,
    ContractSigned: false,
    // Already finished.
    Completed: false,
    Cancelled: false,
    Expired: false,
  };

  it('covers every status the domain defines', () => {
    expect(Object.keys(SPEC).sort()).toEqual([...RESERVATION_STATUSES].sort());
  });

  for (const [status, allowed] of Object.entries(SPEC)) {
    it(`${allowed ? 'allows' : 'refuses'} a request from ${status}`, () => {
      expect(canRequestWithdrawal(status)).toBe(allowed);
    });
  }

  it('refuses a status it has never heard of', () => {
    expect(canRequestWithdrawal('SomethingElse')).toBe(false);
  });
});
