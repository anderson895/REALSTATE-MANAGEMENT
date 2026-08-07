/**
 * Result of the last claim or close, carried back on the query string.
 *
 * Same device as the reservation queue's `ActionNotice`: a server action cannot
 * return a value through a plain `<form action>` without a client component to
 * hold the state, and a banner is not worth shipping JavaScript for. The
 * redirect already had to happen, so it carries the outcome with it.
 *
 * Not shared with that one despite the shape being similar — the wording is the
 * whole component, and "Accepted. The request is yours" has nothing to say
 * about a reservation.
 */

const DONE_MESSAGES: Record<string, string> = {
  confirm: 'Accepted. The request is yours and the buyer can be called back.',
  complete: 'Marked as visited.',
  cancel: 'Request cancelled.',
};

export function SchedulingNotice({ error, done }: { error?: string; done?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
      >
        <AlertGlyph />
        <span>{error}</span>
      </p>
    );
  }

  if (done) {
    return (
      <p
        role="status"
        className="mb-6 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        <CheckGlyph />
        <span>{DONE_MESSAGES[done] ?? 'Done.'}</span>
      </p>
    );
  }

  return null;
}

function AlertGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="mt-0.5 h-4 w-4 shrink-0"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
    </svg>
  );
}
