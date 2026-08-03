/**
 * Shown the instant "Reserve Unit …" is clicked.
 *
 * This route is the slowest in the portal and unavoidably so: it verifies the
 * session, then reads the unit UNCACHED — deliberately, because a stale
 * "Available" would walk a buyer through eight steps and reject them at the
 * end — and only then fetches the project, the parking slots and the buyer's
 * own record.
 *
 * A `loading.tsx` is what turns that wait into a Suspense boundary. Without
 * one, Next has nothing to render while the server works, so the browser sits
 * on the OLD page: the buyer sees their click do nothing, and clicks again.
 *
 * The skeleton mirrors the wizard's real shape — stepper, then a card — so the
 * page does not jump when the content lands.
 */
export default function ReserveLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Preparing your reservation application…</span>

      <div className="mb-6 h-3 w-56 animate-pulse rounded bg-neutral-200" />
      <div className="mb-2 h-6 w-72 animate-pulse rounded bg-neutral-200" />
      <div className="mb-8 h-3 w-96 animate-pulse rounded bg-neutral-100" />

      {/* Eight step circles joined by a rule, matching the real stepper. */}
      <ol className="mb-6 flex items-start">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex min-w-0 flex-1 items-start">
            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 px-0.5">
              <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-2 w-10 animate-pulse rounded bg-neutral-100" />
            </div>
            {i < 7 ? <span className="mt-4 h-px min-w-3 flex-1 bg-neutral-200" /> : null}
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="mb-3 h-3 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="mb-6 h-2.5 w-72 animate-pulse rounded bg-neutral-100" />

        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3">
              <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100" />
              <div className="h-2.5 w-40 animate-pulse rounded bg-neutral-200" />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-5">
          <div className="h-9 w-20 animate-pulse rounded-md bg-neutral-100" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-brand-100" />
        </div>
      </div>
    </div>
  );
}
