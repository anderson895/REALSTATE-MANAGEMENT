import type { Metadata } from 'next';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, EmptyState, PageHeader } from '@sfsr/ui';
import { requireClient } from '@/lib/session';

export const metadata: Metadata = { title: 'My Documents' };

/**
 * Documentary requirements listed in RESERVATION.doc, STEP 6.
 * The government ID is required at reservation; the rest follow afterwards
 * "or upon request by the Sales Department".
 */
const REQUIREMENTS = [
  { label: 'Valid government-issued ID', when: 'Required at reservation' },
  { label: 'BIR Form No. 1904 / TIN', when: 'After submission' },
  { label: 'Proof of Billing', when: 'After submission' },
  { label: 'Certificate of Employment / Proof of Income', when: 'After submission' },
  { label: 'Marriage Certificate', when: 'If applicable' },
  { label: 'Special Power of Attorney', when: 'If applicable' },
  { label: 'Other Supporting Documents', when: 'On request' },
];

export default async function MyDocumentsPage() {
  const session = await requireClient();

  // COST: one read per uploaded document — 0 until the buyer reserves.
  const snap = await getAdminFirestore()
    .collection('documents')
    .where('buyerUid', '==', session.uid)
    .limit(50)
    .get();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="My Documents"
        description="Documents you have uploaded, and their verification status."
      />

      {snap.empty ? (
        <>
          <EmptyState
            title="No documents uploaded yet"
            description="Documentary requirements are uploaded as part of a reservation application. Once submitted, each document appears here with its verification status."
            actionHref="/projects"
            actionLabel="Browse Condominium Projects"
          />

          <Card className="mt-6">
            <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
              What you will be asked for
            </h2>
            <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
              {REQUIREMENTS.map((requirement) => (
                <li key={requirement.label} className="flex justify-between gap-4 px-5 py-2.5">
                  <span>{requirement.label}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{requirement.when}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500 dark:border-neutral-800">
              Accepted formats: PDF, JPG, JPEG, PNG. Maximum 10 MB per file. Uploaded documents
              undergo automated validation; final approval is made by authorised St. Francis Square
              Realty personnel.
            </p>
          </Card>
        </>
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {snap.docs.map((doc) => {
              const data = doc.data();
              return (
                <li key={doc.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{String(data.docType ?? 'Document')}</p>
                    <p className="text-xs text-neutral-500">{String(data.idType ?? '')}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {String(data.status ?? 'Pending')}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
