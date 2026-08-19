import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_DISCOUNT_SCHEDULE,
  DOWN_PAYMENT_TIERS,
  validateDiscountSchedule,
  type DiscountBase,
  type DiscountRule,
  type DiscountSchedule,
  type DownPaymentTier,
} from '@sfsr/domain';

/**
 * The promotional discount schedule, as Documentation maintains it.
 *
 * comments.doc: "Pag may revision sa discount or special discount promo need
 * sya iedit sa internal, ang incharge sa pagpalit ng discount is
 * Documentation." Until this existed the rates were compiled into
 * `discount-strategy.ts` and changing one meant a developer and a deployment.
 *
 * ── One document, read a great deal ──────────────────────────────────────
 *
 * `settings/pricing`. Every unit page and every reservation form needs it, so
 * it is cached by the callers rather than read per render — see the Portal's
 * `getDiscountSchedule`. One document against a 50,000 reads/day quota is
 * nothing; one document per price calculation would not be.
 */

export const PRICING_SETTINGS_DOC = 'pricing';

export interface DiscountScheduleRecord {
  readonly schedule: DiscountSchedule;
  /** Null when nothing has been saved and the documented defaults are in use. */
  readonly updatedAt: Date | null;
  readonly updatedBy: string | null;
  readonly isDefault: boolean;
}

function toRule(raw: unknown): DiscountRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const tier = Number(record.tier);
  const rate = Number(record.rate);
  const base = String(record.base ?? 'none') as DiscountBase;

  if (!(DOWN_PAYMENT_TIERS as readonly number[]).includes(tier)) return null;
  if (!Number.isFinite(rate)) return null;

  return { tier: tier as DownPaymentTier, rate, base };
}

/**
 * Reads the saved schedule, falling back to the documented one.
 *
 * ── Why a bad document is ignored rather than surfaced ───────────────────
 *
 * A schedule that fails validation — a missing tier, a rate someone wrote as
 * "ten" — makes this return RESERVATION.doc's rules instead. Pricing has no
 * state in which it may refuse to answer: the alternative is a buyer looking at
 * a reservation form that shows an error where the price should be, on a public
 * website, until somebody notices. The documented rules are a defensible answer
 * and were the only answer until recently.
 *
 * The save path validates before writing, so a document that fails here got
 * there by hand.
 */
export async function getDiscountSchedule(db: Firestore): Promise<DiscountScheduleRecord> {
  const snap = await db.collection('settings').doc(PRICING_SETTINGS_DOC).get();
  const data = snap.data();

  const raw = Array.isArray(data?.discountSchedule) ? data.discountSchedule : null;
  if (!raw) {
    return { schedule: DEFAULT_DISCOUNT_SCHEDULE, updatedAt: null, updatedBy: null, isDefault: true };
  }

  const parsed = raw.map(toRule).filter((rule): rule is DiscountRule => rule !== null);
  if (validateDiscountSchedule(parsed).length > 0) {
    return { schedule: DEFAULT_DISCOUNT_SCHEDULE, updatedAt: null, updatedBy: null, isDefault: true };
  }

  return {
    schedule: parsed,
    updatedAt: data?.discountUpdatedAt?.toDate?.() ?? null,
    updatedBy: data?.discountUpdatedBy ? String(data.discountUpdatedBy) : null,
    isDefault: false,
  };
}

/**
 * Writes a new schedule.
 *
 * Validates again here rather than trusting the caller. The action above this
 * has already checked, and the browser before that — but this is the last place
 * the data passes through before it becomes what every buyer is quoted, and a
 * check at the boundary costs nothing.
 */
export async function saveDiscountSchedule(
  db: Firestore,
  schedule: DiscountSchedule,
  updatedBy: string,
): Promise<void> {
  const problems = validateDiscountSchedule(schedule);
  if (problems.length > 0) {
    throw new Error(`Refusing to save an invalid discount schedule: ${problems.join(' ')}`);
  }

  await db
    .collection('settings')
    .doc(PRICING_SETTINGS_DOC)
    .set(
      {
        // Spread into plain objects: Firestore rejects class instances, and
        // these arrive as readonly domain types.
        discountSchedule: schedule.map((rule) => ({
          tier: rule.tier,
          rate: rule.rate,
          base: rule.base,
        })),
        discountUpdatedAt: FieldValue.serverTimestamp(),
        discountUpdatedBy: updatedBy,
      },
      { merge: true },
    );
}
