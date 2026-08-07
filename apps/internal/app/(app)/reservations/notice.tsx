import { ACTION_LABELS, isReservationAction } from '@/lib/reservations';

/**
 * Result of the last transition, carried back on the query string.
 *
 * A server action cannot return a value through a plain `<form action>`
 * without a client component to hold the state, and a banner is not worth
 * shipping JavaScript for. The redirect already had to happen; it carries the
 * outcome with it.
 */
export function ActionNotice({ error, done }: { error?: string; done?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="mb-6 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
      >
        {error}
      </p>
    );
  }

  if (done) {
    const label = isReservationAction(done) ? ACTION_LABELS[done] : done;
    return (
      <p
        role="status"
        className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
      >
        {label} — recorded. The audit trail has the entry under your employee ID.
      </p>
    );
  }

  return null;
}
