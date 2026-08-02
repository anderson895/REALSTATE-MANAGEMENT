import type { Metadata } from 'next';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, PageHeader } from '@sfsr/ui';
import { requireClient } from '@/lib/session';

export const metadata: Metadata = { title: 'My Profile' };

export default async function ProfilePage() {
  const session = await requireClient();

  // COST: 1 read.
  const doc = await getAdminFirestore().collection('clients').doc(session.uid).get();
  const data = doc.data() ?? {};

  const fullName = [data.firstName, data.middleName, data.lastName, data.suffix]
    .filter(Boolean)
    .join(' ');

  const dateOfBirth = data.dateOfBirth
    ? new Date(String(data.dateOfBirth)).toLocaleDateString('en-PH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  const consentedAt = data.consent?.acceptedAt?.toDate?.() as Date | undefined;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="My Profile"
        description="The details on your account. Your username is permanent and cannot be changed."
      />

      <Card className="mb-6">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Personal information
        </h2>
        <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          <Row label="Full name" value={fullName || '—'} />
          <Row label="Date of birth" value={dateOfBirth} />
          <Row label="Sex" value={String(data.sex ?? '—')} />
          <Row label="Mobile number" value={String(data.mobile ?? '—')} />
          <Row label="Email address" value={String(data.email ?? '—')} />
        </dl>
      </Card>

      <Card className="mb-6">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Account
        </h2>
        <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          <Row
            label="Username"
            value={String(data.username ?? session.username ?? '—')}
            // RESERVATION.doc: "the assigned username remains permanent and
            // cannot be changed" for record integrity and audit purposes.
            note="Permanent — cannot be changed"
          />
          <Row
            label="Account type"
            value={session.tier === 'PERMANENT' ? 'Permanent Client' : 'Initial Account'}
            note={
              session.tier === 'PERMANENT'
                ? undefined
                : 'Upgrades automatically once your Contract to Sell is signed'
            }
          />
        </dl>
      </Card>

      <Card>
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Data privacy
        </h2>
        <div className="px-5 py-4 text-sm text-neutral-600 dark:text-neutral-400">
          <p>
            You consented to the processing of your personal information under the Data Privacy Act
            of 2012 (Republic Act No. 10173)
            {consentedAt
              ? ` on ${consentedAt.toLocaleDateString('en-PH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}`
              : ''}
            .
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Your information is used solely for reservation processing, financing, billing, customer
            support, and other legitimate business purposes.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 px-5 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right">
        <span className="font-medium">{value}</span>
        {note ? <span className="mt-0.5 block text-xs text-neutral-400">{note}</span> : null}
      </dd>
    </div>
  );
}
