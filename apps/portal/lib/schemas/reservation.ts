import { z } from 'zod';
import { DOWN_PAYMENT_TIERS, FINANCING_OPTIONS, PAYMENT_TERMS, normalizeMobile } from '@sfsr/domain';

/**
 * Reservation application contract, from RESERVATION.doc.
 *
 * Mirrors the eight steps of the form. Validated in the browser for
 * ergonomics and again in the route handler as the actual control (§3.3).
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

export const PAYMENT_CHANNELS = [
  'Bank Deposit',
  'Online Banking',
  'GCash',
  'Maya',
  'Check',
  'Cash',
] as const;

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'] as const;

export const ID_TYPES = [
  'Philippine Passport',
  "Driver's License",
  'UMID / SSS',
  'PhilSys National ID',
  'PRC ID',
  'Postal ID',
  'Voter’s ID',
] as const;

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
  governmentId: z.object({
    idType: z.enum(ID_TYPES),
    file: uploadedFile,
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
