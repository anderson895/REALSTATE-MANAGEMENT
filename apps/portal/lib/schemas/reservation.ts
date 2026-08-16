import { z } from 'zod';
import {
  CIVIL_STATUSES,
  DOWN_PAYMENT_TIERS,
  FINANCING_OPTIONS,
  ID_TYPES,
  PAYMENT_CHANNELS,
  PAYMENT_TERMS,
  normalizeMobile,
} from '@sfsr/domain';

/**
 * Re-exported so the form keeps importing its options from here, while the
 * list itself lives in the domain beside the OCR patterns that grade it. Two
 * copies would eventually disagree, and the failure would be silent: an option
 * the buyer can pick that no pattern can ever recognise.
 */
export { ID_TYPES };

/**
 * Reservation application contract, from RESERVATION.doc.
 *
 * Mirrors the eight steps of the form. Validated in the browser for
 * ergonomics and again in the route handler as the actual control (§3.3).
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

/**
 * Re-exported, not declared.
 *
 * Both lists now live in the domain beside the reservation entity, because the
 * walk-in counter needs the SAME ones and lives in the other app. Declaring
 * them here a second time is how "alisin nadin ang cash at check" gets applied
 * to one door and quietly not the other. See `PAYMENT_CHANNELS` in
 * packages/domain/src/entities/reservation.ts for why those two are gone.
 */
export { PAYMENT_CHANNELS, CIVIL_STATUSES };


const uploadedFile = z.object({
  publicId: required('File'),
  fileName: z.string().trim().max(200),
  mimeType: z.string().trim(),
  sizeBytes: z.number().int().positive(),
});

export const reservationSchema = z.object({
  // ── STEP 1 — Property Selection ──
  unitId: required('Unit'),
  parkingSlotId: z.string().trim().optional().or(z.literal('')),

  // ── STEP 2 — Buyer Information ──
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

  // ── STEP 3 — Payment Terms ──
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

  // ── STEP 5 — Proof of Reservation Payment ──
  payment: z.object({
    paymentDate: required('Payment date'),
    referenceNumber: required('Reference number').max(60),
    channel: z.enum(PAYMENT_CHANNELS),
    amountCentavos: z.number().int().positive(),
    receipt: uploadedFile,
  }),

  // ── STEP 6 — Documentary Requirements ──
  /**
   * BOTH sides of the ID.
   *
   * The front is what identifies the card — its header and issuing office.
   * The back is what a reviewer actually needs to read: the restrictions on a
   * driver's licence, the address on a PhilSys card. A single photo of the
   * front looks complete and is not, which is why this asks for two files
   * rather than one optional extra.
   */
  governmentId: z.object({
    idType: z.enum(ID_TYPES),
    frontFile: uploadedFile,
    backFile: uploadedFile,
    /*
     * What the automated ID check concluded, carried through to the reviewer.
     *
     * `validateIdUpload` already runs in the buyer's browser: it refuses the
     * wrong KIND of card outright, then compares the name it read against the
     * account name and WARNS on a mismatch without blocking — OCR misreads
     * names constantly, and "Ma. Cristina" against "Maria Cristina" is not
     * grounds to turn a real buyer away.
     *
     * That verdict was then thrown away. Documentation had no idea whether the
     * check had passed, so the one thing the system already knew about the
     * name never reached the person whose job is to check the name.
     *
     * Optional, and never trusted: it comes from the browser, so it is a HINT
     * for the reviewer and not a control. A buyer who forged it would only be
     * telling a reviewer to look harder at a card the reviewer is looking at
     * anyway.
     */
    nameCheck: z
      .object({
        verdict: z.enum(['match', 'review', 'mismatch']),
        similarity: z.number().min(0).max(1),
        /** The account name that was compared, as normalised. */
        registeredName: z.string().trim().max(200),
        /** What the OCR read, normalised. Empty when nothing usable was read. */
        readName: z.string().trim().max(400),
      })
      .optional(),
    /*
     * Stage 1 of the same check — is this an ID at all, and is it the one the
     * buyer said it was?
     *
     * note.txt: "ibalik yung OCR sa internal, dapat maveverify kung tama yung
     * format ng ID na inupload niya."
     *
     * `nameCheck` above carried Stage 2 to the reviewer while Stage 1 was
     * still being thrown away — and Stage 1 is the half the note asks about.
     * It is also the firmer half: whether a NAME matches is a judgement, but
     * "you selected Driver's Licence and this reads as a PhilHealth card" is a
     * fact about the document, and the buyer's browser already refused to
     * submit on it. Documentation had no way to see that it had.
     *
     * Optional and never trusted, for the same reason as `nameCheck`: it
     * arrives from the browser. It is a hint telling a reviewer where to look.
     * The Verify ID button in the internal app re-runs the check independently
     * when they want it done again.
     */
    formatCheck: z
      .object({
        verdict: z.enum(['match', 'review', 'mismatch']),
        /** Stage 1: did enough text read as an ID? `null` when too little text. */
        looksLikeId: z.boolean().nullable(),
        /** Stage 1b: did it match the SELECTED type? `null` when Stage 1 failed. */
        idTypeMatch: z.boolean().nullable(),
        /** What it actually looked like, for the refusal message. */
        detectedId: z.string().trim().max(60).nullable(),
        /** False when both images read as the same side of one card. */
        backSideDistinct: z.boolean().nullable(),
      })
      .optional(),
  }),

  // ── STEP 7 — Terms and Conditions ──
  acceptedTerms: z.literal(true, { message: 'You must accept the Terms and Conditions.' }),

  // ── STEP 8 — Buyer's Declaration (five certifications) ──
  declaredTruthful: z.literal(true, { message: 'Please certify that your information is correct.' }),
  declaredReviewed: z.literal(true, { message: 'Please confirm you have reviewed the details.' }),
  declaredNotAutomatic: z.literal(true, {
    message: 'Please acknowledge that submission does not approve the reservation.',
  }),
  declaredSubjectToVerification: z.literal(true, {
    message: 'Please acknowledge that your uploads are subject to verification.',
  }),
  declaredAgreed: z.literal(true, { message: 'Please confirm you agree to the terms.' }),
});

export type ReservationInput = z.infer<typeof reservationSchema>;

export const DOWN_PAYMENT_TIER_OPTIONS = DOWN_PAYMENT_TIERS;
export const PAYMENT_TERM_OPTIONS = PAYMENT_TERMS;
