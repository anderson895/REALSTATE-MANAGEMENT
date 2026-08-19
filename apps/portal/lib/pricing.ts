import { unstable_cache } from 'next/cache';
import type { DiscountSchedule } from '@sfsr/domain';
import { getAdminFirestore, getDiscountSchedule } from '@sfsr/infrastructure/server';

/**
 * The discount schedule Documentation maintains, cached for the Portal.
 *
 * comments.doc moved these rates out of the bundle and into a screen — "ang
 * incharge sa pagpalit ng discount is Documentation" — which means every page
 * that quotes a price now depends on a Firestore document. Uncached, that is
 * one read on every unit page, every price calculator and every step of the
 * reservation wizard, for a document that changes a few times a year.
 *
 * ── Why the TTL is short where the catalogue's is ten minutes ────────────
 *
 * A stale unit listing costs a buyer a wasted click; the reservation
 * transaction re-checks availability and refuses. A stale DISCOUNT is quoted,
 * agreed to, and then written onto the reservation as the rate that sale was
 * made under — there is no later check that would catch it. Sixty seconds
 * bounds how long a buyer can be shown a rate Documentation has withdrawn.
 *
 * `updateDiscountSchedule` calls `updateTag('pricing')`, but that runs in the
 * INTERNAL app — a separate Next.js process on another machine — so it cannot
 * reach this cache. The TTL is what actually expires it here. The tag is
 * declared anyway so the two apps agree about the name, and so this becomes
 * instant if they are ever colocated.
 */
const PRICING_TTL_SECONDS = 60;

export const getCachedDiscountSchedule = unstable_cache(
  async (): Promise<DiscountSchedule> => {
    const record = await getDiscountSchedule(getAdminFirestore());
    return record.schedule;
  },
  ['pricing', 'discount-schedule'],
  { revalidate: PRICING_TTL_SECONDS, tags: ['pricing'] },
);
