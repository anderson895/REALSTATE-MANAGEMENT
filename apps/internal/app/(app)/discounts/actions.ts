'use server';

import { revalidatePath, updateTag } from 'next/cache';
import {
  DOWN_PAYMENT_TIERS,
  EmployeeId,
  canManageDiscounts,
  discountScheduleChanged,
  validateDiscountSchedule,
  type DiscountBase,
  type DiscountRule,
  type DiscountSchedule,
  type DownPaymentTier,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  getAdminFirestore,
  getDiscountSchedule,
  saveDiscountSchedule,
} from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';

/**
 * Changing the promotional discount rates.
 *
 * comments.doc: "ang incharge sa pagpalit ng discount is Documentation."
 *
 * ── Who is allowed in ────────────────────────────────────────────────────
 *
 * `canManageDiscounts`, which is DOCUMENTATION and no one else — not Billing,
 * not Account Receivables, both of whom hold richer money permissions. A
 * discount reduces what a buyer owes, and whoever sets it should not also be
 * the person who verifies the payment against it. `requireModule` gets the
 * person to the screen; this is the check that decides anything.
 *
 * ── What this does NOT touch ─────────────────────────────────────────────
 *
 * Reservations already submitted. Each one carries the rate it was sold under,
 * written at the moment it was created, so a change here reaches new
 * applications only. That was a decision rather than an accident: before the
 * snapshot existed, the discount was recomputed from the tier every time it was
 * displayed, and editing a rate would silently have re-priced every approved
 * reservation on that tier — including ones with a signed Contract to Sell.
 */

export type DiscountResult = { ok: true } | { ok: false; error: string };

function parseRules(raw: unknown): DiscountRule[] | null {
  if (!Array.isArray(raw)) return null;

  const rules: DiscountRule[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const tier = Number(record.tier);
    // Accepts "7.5" from a form field; validateDiscountSchedule rejects the
    // rest, including an empty string, which Number() turns into 0 — a silent
    // "no discount" is exactly the wrong way to read a blank box.
    const rate = typeof record.rate === 'string' ? Number(record.rate.trim()) : Number(record.rate);

    if (!(DOWN_PAYMENT_TIERS as readonly number[]).includes(tier)) return null;
    if (typeof record.rate === 'string' && record.rate.trim() === '') return null;

    rules.push({
      tier: tier as DownPaymentTier,
      rate,
      base: String(record.base ?? 'none') as DiscountBase,
    });
  }
  return rules;
}

export async function updateDiscountSchedule(payload: unknown): Promise<DiscountResult> {
  const session = await requireModule('APPROVAL_MONITORING');
  const actor = toActor(session);

  if (!canManageDiscounts(actor)) {
    return {
      ok: false,
      error:
        'Only the Documentation Department can change discount rates. Your account can view them.',
    };
  }

  const rules = parseRules(payload);
  if (!rules) {
    return { ok: false, error: 'Enter a discount for every tier, as a number.' };
  }

  const problems = validateDiscountSchedule(rules);
  if (problems.length > 0) {
    return { ok: false, error: problems.join(' ') };
  }

  const db = getAdminFirestore();

  try {
    // Read the outgoing schedule BEFORE overwriting it — the audit entry
    // carries both sides, and after the write the old one is unrecoverable.
    const previous = await getDiscountSchedule(db);
    const next: DiscountSchedule = rules;

    const unchanged =
      previous.schedule.length === next.length &&
      previous.schedule.every((before) => {
        const after = next.find((rule) => rule.tier === before.tier);
        return after && after.rate === before.rate && after.base === before.base;
      });

    if (unchanged) {
      // Saving nothing would still stamp the document and write an audit entry
      // reading "changed from X to X", which makes the trail harder to read
      // rather than more complete.
      return { ok: true };
    }

    await saveDiscountSchedule(db, next, session.employeeId);

    await new FirestoreAuditLogger(db).record(
      [
        discountScheduleChanged(
          previous.schedule.map((r) => ({ tier: r.tier, rate: r.rate, base: r.base })),
          next.map((r) => ({ tier: r.tier, rate: r.rate, base: r.base })),
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    /*
     * The Portal is a SEPARATE process on another machine, so this tag reaches
     * this app's cache and not its. A rate change appears to buyers within the
     * Portal's own revalidate window rather than instantly — stated here rather
     * than left to be discovered, the same way the inventory actions state it.
     */
    updateTag('pricing');
    revalidatePath('/discounts');

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not save the discount rates.',
    };
  }
}
