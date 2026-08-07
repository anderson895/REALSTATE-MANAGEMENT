import type { TrippingStatus } from '@sfsr/infrastructure/server';

/**
 * Presentation rules for the Tripping Schedule.
 *
 * Pure functions, kept out of the page so they can be tested without rendering
 * anything — the same split `lib/reservations.ts` uses for the reservation
 * queue. Nothing here decides whether an action is allowed; that is the server
 * action's job and the Security Rules'.
 */

/**
 * What the status is CALLED on screen, which is not what it is called in the
 * database.
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws the Sales Agent's queue with a
 * blue "New" pill on a freshly raised request. The stored status is
 * `Requested`, and it stays that way: renaming it would mean touching the
 * Portal that writes it, the transaction that reads it and the Security Rules,
 * to change a word on one screen. The label is the translation layer.
 */
export const TRIPPING_STATUS_LABELS: Record<TrippingStatus, string> = {
  Requested: 'New',
  Confirmed: 'Confirmed',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

/**
 * "2025-05-20" -> "May 20, 2025".
 *
 * Forced to UTC. `preferredDate` is a plain calendar date the buyer typed, so
 * it has no time zone of its own — but `new Date('2025-05-20')` is parsed as
 * UTC midnight, and rendering that in Asia/Manila is fine while rendering it
 * anywhere west of London silently shows the day before.
 */
export function formatPreferredDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || '—';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
