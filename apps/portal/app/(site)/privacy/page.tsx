import type { Metadata } from 'next';
import { Card, PageHeader } from '@sfsr/ui';

export const metadata: Metadata = { title: 'Privacy Policy' };

/**
 * Data Privacy Act notice.
 *
 * The registration form asks buyers to authorise processing "in accordance
 * with the Data Privacy Act of 2012 (Republic Act No. 10173)". That consent
 * is only meaningful if the buyer can read what they are consenting to, so
 * this page states what is collected, why, and who sees it — drawn from the
 * RBAC matrix rather than invented.
 */

const COLLECTED = [
  { item: 'Name, date of birth, sex, and civil status', why: 'To identify you on the reservation application and the Contract to Sell.' },
  { item: 'Mobile number and email address', why: 'To notify you of your reservation status and any deficiency requiring your response.' },
  { item: 'Current address and TIN', why: 'Required on the reservation application and for BIR documentation.' },
  { item: 'Government-issued ID and supporting documents', why: 'To verify your identity as required before a reservation can be approved.' },
  { item: 'Proof of payment and payment details', why: 'So the Cash and Accounting Departments can confirm and receipt your payment.' },
];

const WHO_SEES = [
  { role: 'Documentation Department', scope: 'Your profile and documentary requirements, to validate them.' },
  { role: 'Account Receivables', scope: 'Your reservation and payment status, to verify the reservation fee.' },
  { role: 'Billing Department', scope: 'Your payment terms and Statement of Account.' },
  { role: 'Cash Department', scope: 'Payment records and official receipts.' },
  { role: 'Loans Management', scope: 'Your profile and payment monitoring, for financing coordination.' },
  { role: 'Legal Counsel', scope: 'Your profile only, on a read-only basis.' },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="Privacy Policy"
        description="How St. Francis Square Realty Corporation collects and processes your personal information under the Data Privacy Act of 2012 (Republic Act No. 10173)."
      />

      <Card className="mb-6">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          What we collect, and why
        </h2>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {COLLECTED.map((entry) => (
            <li key={entry.item} className="px-5 py-3">
              <p className="text-sm font-medium">{entry.item}</p>
              <p className="mt-0.5 text-sm text-neutral-500">{entry.why}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-6">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Who can see it
        </h2>
        <p className="border-b border-neutral-100 px-5 py-3 text-sm text-neutral-500 dark:border-neutral-800">
          Access is limited by role. No department sees more than its work requires.
        </p>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {WHO_SEES.map((entry) => (
            <li key={entry.role} className="px-5 py-3">
              <p className="text-sm font-medium">{entry.role}</p>
              <p className="mt-0.5 text-sm text-neutral-500">{entry.scope}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Your rights
        </h2>
        <div className="space-y-2 px-5 py-4 text-sm text-neutral-600 dark:text-neutral-400">
          <p>
            Under the Data Privacy Act of 2012 you have the right to be informed, to access and
            correct your personal information, to object to its processing, and to lodge a complaint
            with the National Privacy Commission.
          </p>
          <p>
            Your information is used solely for reservation processing, financing, billing, customer
            support, and other legitimate business purposes. Reservation records — including
            cancelled ones — are retained for audit and historical purposes as company policy and
            applicable law require.
          </p>
          <p>
            To exercise any of these rights, contact St. Francis Square Realty Corporation through
            your assigned sales agent or our Documentation Department.
          </p>
        </div>
      </Card>
    </div>
  );
}
