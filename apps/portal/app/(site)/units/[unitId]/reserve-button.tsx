'use client';

import Link, { useLinkStatus } from 'next/link';

/**
 * "Reserve Unit …", with a pending state.
 *
 * `loading.tsx` covers the wait once the navigation has started, but there is
 * a gap before that: the click fires, the router begins fetching, and for a
 * moment the button looks exactly as it did — so a buyer on a slow connection
 * presses it again.
 *
 * `useLinkStatus` closes that gap. It has to be read from a component INSIDE
 * the `<Link>`, which is why the label lives in its own child rather than
 * inline here.
 */
function Label({ unitNo }: { unitNo: string }) {
  const { pending } = useLinkStatus();

  if (!pending) return <>Reserve Unit {unitNo}</>;

  return (
    <>
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      Preparing your application…
    </>
  );
}

export function ReserveButton({ unitId, unitNo }: { unitId: string; unitNo: string }) {
  return (
    <Link
      href={`/reserve/${unitId}`}
      className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
    >
      <Label unitNo={unitNo} />
    </Link>
  );
}
