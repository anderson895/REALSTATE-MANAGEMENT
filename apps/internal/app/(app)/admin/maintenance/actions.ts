'use server';

import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/session';
import { devToolsEnabled, resetReservationData, type ResetCounts } from '@/lib/dev-reset';

/**
 * Server action behind the development reset panel.
 *
 * ── Two guards, and why neither is the panel being hidden ────────────────
 *
 * The panel does not render outside `next dev`, but that is a rendering
 * decision and a server action is a public HTTP endpoint — anything that knows
 * its id can invoke it, whether or not a button exists. So:
 *
 *   1. NODE_ENV is checked HERE, and again inside `resetReservationData`.
 *      A production build cannot run this even if the request is forged.
 *   2. An employee session is still required, so it is not an open endpoint
 *      on a developer's machine either.
 *
 * The two are independent on purpose. Deleting every reservation is the most
 * destructive thing this application can do, and it should take more than one
 * mistake to reach it.
 */
export async function resetReservations(): Promise<{ ok: boolean; counts?: ResetCounts; error?: string }> {
  if (!devToolsEnabled()) {
    return { ok: false, error: 'Not available outside development.' };
  }

  // Redirects to /login if there is no session, which is the right answer for
  // an unauthenticated caller.
  await requireEmployee();

  try {
    const counts = await resetReservationData();

    // Every screen that counts reservations is now wrong until it re-renders.
    revalidatePath('/', 'layout');

    return { ok: true, counts };
  } catch (error) {
    console.error('Development reset failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Reset failed.' };
  }
}
