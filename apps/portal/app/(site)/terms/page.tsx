import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import { Card, PageHeader } from '@sfsr/ui';

export const metadata: Metadata = { title: 'Reservation Terms and Conditions' };

/**
 * The eleven clauses from RESERVATION.doc, STEP 7 — transcribed, not
 * paraphrased. The registration form asks buyers to agree to these, so the
 * text they can read has to be the text they are agreeing to.
 */
const CLAUSES = [
  'The reservation application shall be processed only after the reservation fee has been verified by the Billing Department.',
  'Once payment has been verified, the selected unit shall be placed under On Hold status while the reservation is being evaluated.',
  'The Buyer shall submit all required documentary requirements within thirty (30) calendar days from the reservation date.',
  'The reservation fee shall form part of the purchase price and is NON-REFUNDABLE and NON-TRANSFERABLE, except when the reservation is cancelled by St. Francis Square Realty Corporation due to reasons attributable to the company or as otherwise required by applicable law.',
  'Failure to submit the required documents, failure to comply with the approved payment schedule, submission of false or fraudulent information, or voluntary withdrawal of the reservation application may result in cancellation of the reservation in accordance with company policy and applicable laws.',
  'Submission of proof of payment does not automatically constitute payment confirmation. All payments remain subject to verification by the Billing and Accounting Departments.',
  'All uploaded documents shall be processed using OCR technology to assist in document validation. Final approval shall be made by authorized company personnel.',
  'This reservation is personal to the Buyer and may not be assigned or transferred without the prior written consent of St. Francis Square Realty Corporation.',
  'The Developer reserves the right to make reasonable changes to building plans, specifications, finishes, and materials due to engineering requirements, government regulations, or material availability.',
  'The Developer reserves the right to approve, reject, or cancel any reservation application that does not comply with company policies or legal requirements.',
  'Personal information collected through this system shall be processed in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and shall be used solely for reservation processing, financing, billing, customer support, and other legitimate business purposes.',
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="Reservation Terms and Conditions"
        description="St. Francis Square Realty Corporation — Condominium Unit Reservation Application."
      />

      <Card className="mb-6 p-5">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          A reservation fee of{' '}
          <span className="tabular font-semibold">{Money.fromPesos(50_000).format()}</span> applies.
          It forms part of the purchase price and is{' '}
          <span className="font-semibold">non-refundable and non-transferable</span>, except where
          clause 4 provides otherwise.
        </p>
      </Card>

      <Card>
        <ol className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {CLAUSES.map((clause, index) => (
            <li key={index} className="flex gap-4 px-5 py-4">
              <span className="shrink-0 text-sm font-semibold text-brand-600">{index + 1}.</span>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {clause}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <p className="mt-6 text-xs text-neutral-400">
        These terms are presented again during the reservation application, where they must be
        accepted before submission.
      </p>
    </div>
  );
}
