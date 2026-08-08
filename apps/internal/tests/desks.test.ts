import { describe, expect, it } from 'vitest';
import type { InternalActor, InternalRole } from '@sfsr/domain';
import { canTakeAction, refusalFor } from '../lib/reservations';

/**
 * note.txt: "ang pwede lang i-verify ni billing ay payment at ang pwede lang
 * din i-verify ni documentation ay document."
 *
 * Both desks hold RESERVATION_VERIFICATION with `modify`, so the module grant
 * alone gave each of them BOTH halves — Billing could sign off an ID it never
 * looked at, and Documentation could clear a payment it has no bank statement
 * for. These are the cases that catch that coming back.
 */
const staff = (role: InternalRole): InternalActor => ({ role, isSupervisor: false });
const sup = (role: InternalRole): InternalActor => ({ role, isSupervisor: true });

describe('who may verify which half', () => {
  it('lets Billing verify the payment and nothing else', () => {
    expect(canTakeAction(staff('BILLING'), 'verifyPayment')).toBe(true);
    expect(canTakeAction(staff('BILLING'), 'verifyDocuments')).toBe(false);
  });

  it('lets Documentation verify the documents and nothing else', () => {
    expect(canTakeAction(staff('DOCUMENTATION'), 'verifyDocuments')).toBe(true);
    expect(canTakeAction(staff('DOCUMENTATION'), 'verifyPayment')).toBe(false);
  });

  it('does not lift the split for a supervisor', () => {
    // Seniority does not make a Billing supervisor competent to check an ID.
    expect(canTakeAction(sup('BILLING'), 'verifyDocuments')).toBe(false);
    expect(canTakeAction(sup('DOCUMENTATION'), 'verifyPayment')).toBe(false);
  });

  it('gives final approval to the Documentation Supervisor alone', () => {
    expect(canTakeAction(sup('DOCUMENTATION'), 'approve')).toBe(true);
    expect(canTakeAction(staff('DOCUMENTATION'), 'approve')).toBe(false);
    expect(canTakeAction(sup('BILLING'), 'approve')).toBe(false);
    expect(canTakeAction(sup('ACCOUNT_RECEIVABLES'), 'approve')).toBe(false);
  });
});

/**
 * FOUR EYES.
 *
 * The client, on the Documentation Supervisor: "hindi siya pwedeng mag verify
 * ng document, si staff lang." They verify OR they approve, never both on the
 * same reservation — which is the only reason the two signatures the audit
 * trail records mean anything.
 */
describe('the approver may not also verify', () => {
  it('refuses the Documentation Supervisor the document check', () => {
    // The whole point: this pair used to be true/true, so one person could
    // carry a reservation from submitted to approved on the document side
    // alone and leave two clean signatures behind.
    expect(canTakeAction(sup('DOCUMENTATION'), 'verifyDocuments')).toBe(false);
    expect(canTakeAction(sup('DOCUMENTATION'), 'approve')).toBe(true);
  });

  it('leaves the check with Documentation staff', () => {
    // Someone must still be able to do it. EMP012 and EMP013 in
    // employees.json are Documentation staff; EMP011 is the supervisor.
    expect(canTakeAction(staff('DOCUMENTATION'), 'verifyDocuments')).toBe(true);
    expect(canTakeAction(staff('DOCUMENTATION'), 'approve')).toBe(false);
  });

  it('does not disarm the Billing supervisor', () => {
    // Billing holds no approval right, so verifying a payment ends its
    // involvement — there is no second signature of theirs to conflict with.
    expect(canTakeAction(sup('BILLING'), 'verifyPayment')).toBe(true);
  });

  it('still lets a supervisor send a bad application back', () => {
    // Noting a deficiency is a refusal, not an approval. A supervisor who
    // spots a forged ID at final review must be able to bounce it.
    expect(canTakeAction(sup('DOCUMENTATION'), 'noteDeficiency')).toBe(true);
  });

  /*
   * The screen tells the supervisor WHY the button is missing, and it asks
   * this function rather than re-deriving the rule. These pin the three
   * answers apart, because they are three different sentences on screen and
   * showing the wrong one is how "deliberate" starts looking like "broken".
   */
  it('distinguishes the three reasons a step is unavailable', () => {
    expect(refusalFor(sup('DOCUMENTATION'), 'verifyDocuments')).toBe('approverMayNotVerify');
    expect(refusalFor(staff('DOCUMENTATION'), 'verifyPayment')).toBe('otherDesk');
    expect(refusalFor(staff('SALES'), 'verifyDocuments')).toBe('notGranted');
    expect(refusalFor(staff('DOCUMENTATION'), 'verifyDocuments')).toBeNull();
  });
});

describe('who may verify which half (cont.)', () => {

  it('lets a Sales Agent raise a walk-in but verify none of it', () => {
    expect(canTakeAction(staff('SALES'), 'verifyPayment')).toBe(false);
    expect(canTakeAction(staff('SALES'), 'verifyDocuments')).toBe(false);
    expect(canTakeAction(staff('SALES'), 'approve')).toBe(false);
  });

  it('keeps IT out of every step', () => {
    for (const action of ['verifyPayment', 'verifyDocuments', 'approve', 'noteDeficiency'] as const) {
      expect(canTakeAction(staff('IT_ADMINISTRATOR'), action), action).toBe(false);
    }
  });
});
