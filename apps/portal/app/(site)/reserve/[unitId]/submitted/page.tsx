import Link from 'next/link';
import type { Metadata } from 'next';
import { Card } from '@sfsr/ui';
import { requireClient } from '@/lib/session';

export const metadata: Metadata = { title: 'Reservation Submitted' };

/**
 * The confirmation screen from RESERVATION.doc, "SYSTEM CONFIRMATION".
 *
 * Wording follows the document: the reference number, the current status, and
 * an explicit statement that submission is not approval — which the buyer has
 * just certified they understand in Step 8.
 */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await requireClient();
  const { ref } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-6 flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/40">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-brand-600 dark:text-brand-400"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>

      <h1 className="text-center text-xl font-semibold">
        Reservation Application Submitted Successfully
      </h1>
      <p className="mt-2 text-center text-sm text-neutral-500">
        Thank you for choosing St. Francis Square Realty Corporation.
      </p>

      <Card className="mt-8">
        <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          <div className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-neutral-500">Reservation Reference No.</dt>
            <dd className="tabular font-semibold">{ref ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-neutral-500">Current Status</dt>
            <dd className="font-medium text-amber-700 dark:text-amber-400">
              Pending Payment and Document Verification
            </dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 rounded-lg bg-neutral-50 p-5 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        <p>
          Our Sales, Billing, and Documentation Departments will verify your payment and uploaded
          documents. You may monitor the progress of your application through your Client Portal.
          You will receive a notification once your reservation has been reviewed.
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          Your selected unit is placed on hold only after the Account Receivables team verifies your
          reservation fee. Submitting proof of payment does not by itself confirm payment.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard/reservations"
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          View My Reservations
        </Link>
        <Link
          href="/projects"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Continue Browsing
        </Link>
      </div>
    </div>
  );
}
