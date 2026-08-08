import { z } from 'zod';
import { UNIT_TYPES } from '@sfsr/domain';

/**
 * Adding stock — projects and units — as Marketing types it.
 *
 * A client instruction: "dapat nakakapag add din ang marketing ng mga project
 * at unit." Until now the catalogue could only arrive through
 * `npm run seed:load` out of `DATABASE PROJECT.xls`; there was no screen for
 * new inventory at all.
 *
 * ── Pesos in, centavos out ────────────────────────────────────────────────
 *
 * Every amount in this system is an integer count of centavos, because
 * IEEE-754 cannot represent 0.1 and the error compounds across a 36-month
 * amortisation until the final balance will not close (§3.5). Nobody types
 * centavos, so these schemas accept PESOS and the action multiplies once, at
 * the edge — which is the only place a peso figure is allowed to exist.
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

/**
 * A project code, which is also its document id.
 *
 * `TLP001`, `EPR002`, `SQR003`, `GVR004`, `HPR004` — two to four letters then
 * three digits. Note that GVR004 and HPR004 share a number: the digits are not
 * a sequence and never were, so this validates the SHAPE and leaves the value
 * to whoever is naming the building.
 */
export const PROJECT_CODE_PATTERN = /^[A-Z]{2,4}\d{3}$/;

/**
 * The letters a project's unit ids begin with.
 *
 * `U`, `EU`, `SQ`, `GV`, `HP` for the five seeded projects. Kept short because
 * it is read aloud and typed into search boxes; unique across projects because
 * all 150 units share one collection and two projects on `HP` would interleave
 * their series.
 */
export const UNIT_PREFIX_PATTERN = /^[A-Z]{1,4}$/;

export const projectSchema = z.object({
  code: required('Project code')
    .max(8)
    .transform((v) => v.toUpperCase())
    .refine((v) => PROJECT_CODE_PATTERN.test(v), 'Use 2–4 letters then 3 digits, e.g. MPR006.'),
  name: required('Project name').max(120),
  developer: required('Developer').max(120),
  location: required('Location').max(160),
  buildingType: required('Building type').max(120),
  /**
   * `floorsRaw`, and raw is the point.
   *
   * The workbook holds "42", "35", "40 Floors" and "38 Floors" in the same
   * column. Parsing it to a number would silently discard what the sheet says,
   * and nothing computes with it — it is printed.
   */
  floorsRaw: required('Number of floors').max(40),
  theme: z.string().trim().max(200).optional().or(z.literal('')),
  unitPrefix: required('Unit ID prefix')
    .max(4)
    .transform((v) => v.toUpperCase())
    .refine((v) => UNIT_PREFIX_PATTERN.test(v), 'Use 1–4 letters, e.g. MP.'),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/**
 * A peso amount typed into a form.
 *
 * Accepts "6,000,000" and "6000000.50" — a price with thousands separators is
 * what anyone reading it off a price list will paste in, and rejecting the
 * commas teaches nothing.
 */
const pesos = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((v) => Number(v.replace(/,/g, '')))
    .refine((n) => Number.isFinite(n) && n > 0, `${label} must be a positive amount.`)
    .refine((n) => n <= max, `${label} looks too large — check the figure.`);

export const unitSchema = z.object({
  projectId: required('Project'),
  /** Optional: The Legaspi Place has no towers, so its units store `null`. */
  tower: z.string().trim().max(40).optional().or(z.literal('')),
  floor: z
    .string()
    .trim()
    .min(1, 'Floor is required.')
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 200, 'Floor must be between 1 and 200.'),
  unitNo: required('Unit number').max(30),
  unitType: z.enum(UNIT_TYPES),
  areaSqm: z
    .string()
    .trim()
    .min(1, 'Floor area is required.')
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 2000, 'Floor area must be 1–2000 sqm.'),
  // A billion pesos per sqm and a hundred billion for a unit are not limits
  // anyone will meet; they are there so a slipped keyboard cannot write a
  // price the pricing engine would then quote to a buyer.
  pricePerSqm: pesos('Price per sqm', 100_000_000),
  purchasePrice: pesos('Purchase price', 100_000_000_000),
});

export type UnitInput = z.infer<typeof unitSchema>;

/**
 * Purchase price, as the seeded data computes it.
 *
 * Every one of the 150 seeded units satisfies `area × price/sqm` exactly — 24
 * sqm at ₱250,000 is ₱6,000,000. So the form fills this in rather than making
 * anyone reach for a calculator, and leaves it EDITABLE, because a penthouse
 * with a view premium is a real thing and a derived field that cannot be
 * overridden would make it unenterable.
 */
export function derivePurchasePrice(areaSqm: string, pricePerSqm: string): string {
  const area = Number(areaSqm.replace(/,/g, ''));
  const rate = Number(pricePerSqm.replace(/,/g, ''));
  if (!Number.isFinite(area) || !Number.isFinite(rate) || area <= 0 || rate <= 0) return '';
  return String(Math.round(area * rate * 100) / 100);
}

/** `MPR006` -> `MP`. A suggestion; the field stays editable. */
export function suggestUnitPrefix(code: string): string {
  return code.replace(/\d+$/, '').toUpperCase().slice(0, 2);
}
