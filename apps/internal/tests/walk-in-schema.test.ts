import { describe, expect, it } from 'vitest';
import { can, type InternalActor, type InternalRole } from '@sfsr/domain';
import { walkInSchema } from '../lib/walk-in-schema';

/**
 * The walk-in payload is validated in the browser for ergonomics and again in
 * the server action as the actual control (Development Plan.md §3.3). These
 * exercise the server-side schema, because that is the one that decides.
 */
const file = {
  publicId: 'client/abc/receipt-1',
  fileName: 'receipt.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
};

const payload = (over: Record<string, unknown> = {}) => ({
  buyerUid: 'UID123',
  unitId: 'EPR-A-1201',
  parkingSlotId: '',
  civilStatus: 'Single',
  nationality: 'Filipino',
  tin: '',
  mobile: '09171234567',
  houseNo: '',
  street: 'Ayala Avenue',
  barangay: 'Bel-Air',
  city: 'Makati',
  province: 'Metro Manila',
  zipCode: '1209',
  downPaymentTier: 20,
  paymentTerm: 12,
  financingOption: 'Bank Financing',
  salesAgentId: '',
  payment: {
    paymentDate: '2026-08-08',
    referenceNumber: 'BDO-99881',
    channel: 'Bank Deposit',
    amountCentavos: 2_500_000,
    receipt: file,
  },
  governmentId: { idType: 'PhilSys National ID', frontFile: file, backFile: file },
  buyerSignedForm: true,
  ...over,
});

describe('walkInSchema', () => {
  it('accepts a complete counter-entered reservation', () => {
    expect(walkInSchema.safeParse(payload()).success).toBe(true);
  });

  /*
   * "pati sa walk in alisin nadin ang cash at check."
   *
   * The reason this test exists rather than trusting the enum: the list used to
   * be declared separately in the Portal and would have been declared again
   * here, so removing cash from one door and not the other was a single
   * copy-paste away. Both now read PAYMENT_CHANNELS from the domain.
   */
  it('refuses cash and check at the counter', () => {
    for (const channel of ['Cash', 'Check']) {
      const result = walkInSchema.safeParse(payload({
        payment: { ...payload().payment, channel },
      }));
      expect(result.success, channel).toBe(false);
    }
  });

  it('refuses a reservation with no signed form on file', () => {
    // The counter's replacement for the buyer's five tick boxes. Without it
    // there is no record that the buyer agreed to anything.
    expect(walkInSchema.safeParse(payload({ buyerSignedForm: false })).success).toBe(false);
  });

  it('requires BOTH sides of the ID', () => {
    const oneSide = payload({
      governmentId: { idType: 'PhilSys National ID', frontFile: file },
    });
    expect(walkInSchema.safeParse(oneSide).success).toBe(false);
  });

  it('refuses a reservation with no buyer account behind it', () => {
    // submit() takes a ClientId; the payment, documents and eventual Permanent
    // Client Account all hang off it. A blank uid produces orphans.
    expect(walkInSchema.safeParse(payload({ buyerUid: '' })).success).toBe(false);
  });

  it('refuses a zero or negative reservation fee', () => {
    for (const amountCentavos of [0, -100]) {
      const result = walkInSchema.safeParse(payload({
        payment: { ...payload().payment, amountCentavos },
      }));
      expect(result.success, String(amountCentavos)).toBe(false);
    }
  });

  it('holds a walk-in to the same mobile format as the Portal', () => {
    expect(walkInSchema.safeParse(payload({ mobile: '12345' })).success).toBe(false);
  });
});

/**
 * "documentation ang in charge for walk in application."
 *
 * The page and all three server actions gate on `create` over
 * RESERVATION_VERIFICATION. This pins which roles that lets through — the
 * point being that Billing and Sales hold the SAME module and must still be
 * refused, which a module-level check would not catch.
 */
describe('who may raise a walk-in', () => {
  const actor = (role: InternalRole): InternalActor => ({ role, isSupervisor: false });

  it('lets Documentation raise one', () => {
    expect(can(actor('DOCUMENTATION'), 'RESERVATION_VERIFICATION', 'create')).toBe(true);
  });

  it('refuses every other desk, including two that hold the module', () => {
    for (const role of ['BILLING', 'SALES', 'IT_ADMINISTRATOR', 'ACCOUNT_RECEIVABLES'] as const) {
      expect(can(actor(role), 'RESERVATION_VERIFICATION', 'create'), role).toBe(false);
    }
  });

  /*
   * NOT TESTED HERE: that the sidebar link appears for Documentation alone.
   *
   * `navigationFor` lives in a .tsx file — every route carries its icon — and
   * this suite is deliberately DOM-free and JSX-free (see vitest.config.mts).
   * Teaching the runner to transform JSX for one assertion would widen the
   * suite's remit to cover a link, which is presentation. The grant above is
   * the control, and it is what refuses Billing and Sales at the page and at
   * all three server actions.
   */
});
