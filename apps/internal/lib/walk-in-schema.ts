import { z } from 'zod';
import {
  CIVIL_STATUSES,
  FINANCING_OPTIONS,
  ID_TYPES,
  PAYMENT_CHANNELS,
  normalizeMobile,
} from '@sfsr/domain';

/**
 * A walk-in reservation, as encoded at the counter.
 *
 * note.txt: "Add walking reservation on internal same process sa web portal."
 *
 * ── How this differs from the Portal's schema, and why ────────────────────
 *
 * Same fields, one honest difference: the five buyer declarations.
 *
 * On the Portal the buyer ticks them, and `z.literal(true)` is a fair record of
 * that — the person making the certification is the person operating the form.
 * At the counter it is a STAFF MEMBER at the keyboard, so five checkboxes would
 * record the buyer certifying something the buyer never touched. That is not a
 * weaker version of the same evidence; it is a different and false claim.
 *
 * So this asks the encoder for one thing instead: that the buyer signed the
 * printed form in front of them. `attestedBy` on the reservation names who said
 * so, and the paper is the buyer's actual signature. One assertion that is true
 * beats five that are theatre.
 *
 * Everything else is deliberately identical, including the 21+ floor and the
 * absence of Cash and Check — a counter is not a way around either.
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

const uploadedFile = z.object({
  publicId: required('File'),
  fileName: z.string().trim().max(200),
  mimeType: z.string().trim(),
  sizeBytes: z.number().int().positive(),
});

export const walkInSchema = z.object({
  /**
   * The buyer's account, resolved BEFORE this form is submitted.
   *
   * Not a name typed here: `ReservationWorkflowService.submit` takes a
   * `ClientId`, and the payment, the documents and eventually the Permanent
   * Client Account all hang off it. See `apps/internal/lib/walk-in.ts`.
   */
  buyerUid: required('Buyer'),

  // ── Property ──
  unitId: required('Unit'),
  parkingSlotId: z.string().trim().optional().or(z.literal('')),

  // ── Buyer information, as the Portal captures at STEP 2 ──
  civilStatus: z.enum(CIVIL_STATUSES),
  nationality: required('Nationality').max(60),
  tin: z.string().trim().max(20).optional().or(z.literal('')),
  mobile: required('Mobile number').refine(
    (value) => normalizeMobile(value) !== null,
    'Enter a valid Philippine mobile number.',
  ),
  houseNo: z.string().trim().max(60).optional().or(z.literal('')),
  street: required('Street').max(120),
  barangay: required('Barangay').max(120),
  city: required('City or municipality').max(120),
  province: required('Province').max(120),
  zipCode: required('ZIP code').max(10),

  // ── Payment terms ──
  downPaymentTier: z.union([
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(40),
    z.literal(50),
  ]),
  paymentTerm: z.union([
    z.literal('Spot Cash'),
    z.literal(6),
    z.literal(12),
    z.literal(18),
    z.literal(24),
    z.literal(30),
    z.literal(36),
  ]),
  financingOption: z.enum(FINANCING_OPTIONS),
  salesAgentId: z.string().trim().optional().or(z.literal('')),

  // ── Proof of reservation payment ──
  payment: z.object({
    paymentDate: required('Payment date'),
    referenceNumber: required('Reference number').max(60),
    channel: z.enum(PAYMENT_CHANNELS),
    amountCentavos: z.number().int().positive(),
    receipt: uploadedFile,
  }),

  // ── Documentary requirements ──
  governmentId: z.object({
    idType: z.enum(ID_TYPES),
    frontFile: uploadedFile,
    backFile: uploadedFile,
  }),

  /**
   * The encoder's attestation, in place of the buyer's five tick boxes.
   *
   * Worded as a statement about the PAPER because that is what makes it
   * checkable later: if this is ever disputed, someone can ask for the signed
   * form, and either it exists or the attestation was false.
   */
  buyerSignedForm: z.literal(true, {
    message: 'Confirm the buyer has signed the printed reservation form.',
  }),
});

export type WalkInInput = z.infer<typeof walkInSchema>;
