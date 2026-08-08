'use server';

import { updateTag } from 'next/cache';
import { requireEmployee } from '@/lib/session';

/**
 * Force the dashboard's counters to be re-counted.
 *
 * The figures sit behind `unstable_cache` with a sixty-second TTL, tagged
 * `projects` and `units` so that verifying a payment or approving a reservation
 * refreshes them immediately. This is the manual version of the same signal,
 * for somebody who has just changed something in another tab and does not want
 * to wait out the window.
 *
 * ── Why it is gated at all ────────────────────────────────────────────────
 *
 * It writes nothing and reveals nothing, so the check is not protecting data —
 * it is protecting the read budget. Invalidating the tag costs the NEXT render
 * a fresh set of count() aggregations, and an unauthenticated endpoint that
 * makes the server re-count on demand is a way to spend a 50,000/day quota from
 * outside. `requireEmployee` is the whole control, and it is enough.
 */
export async function refreshInventoryFigures(): Promise<void> {
  await requireEmployee();
  updateTag('units');
  updateTag('projects');
}
