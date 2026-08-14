import type { Metadata } from 'next';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, PageHeader } from '@sfsr/ui';
import { requireClient } from '@/lib/session';
import { ChangePassword } from './change-password';
import { EditProfile } from './edit-profile';
import { Tabs } from './tabs';

export const metadata: Metadata = { title: 'My Profile' };

/**
 * `<input type="date">` reads and writes `YYYY-MM-DD` and silently shows an
 * empty field for anything else.
 *
 * Registration writes that string straight through, so most records already
 * hold it — but a Firestore Timestamp appears in records created at the walk-in
 * counter, and `toISOString()` would shift a date near midnight into the
 * previous day for a buyer in UTC+8. Formatting from the LOCAL parts avoids
 * that: nobody's birthday should move because of a timezone.
 */
function toDateInputValue(value: unknown): string {
  if (value == null) return '';

  const date =
    typeof (value as { toDate?: () => Date }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));

  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default async function ProfilePage() {
  const session = await requireClient();

  // COST: 1 read.
  const doc = await getAdminFirestore().collection('clients').doc(session.uid).get();
  const data = doc.data() ?? {};

  const consentedAt = data.consent?.acceptedAt?.toDate?.() as Date | undefined;

  /*
   * Both panels are built here, as ordinary server markup, and handed to the
   * client `Tabs` component. Only the switching needs to be client-side — see
   * the note in tabs.tsx.
   *
   * Account and Data privacy both sit with Personal information, and the
   * security tab holds one form.
   *
   * Data privacy was briefly filed under security, on the reasoning that
   * privacy and security are adjacent. They are, but that is not how the card
   * reads: "You consented to the processing of YOUR PERSONAL INFORMATION" is a
   * statement ABOUT the fields directly above it, not a control the buyer
   * operates. Everything in the security tab is something you DO; the consent
   * notice is something that IS. A buyer looking for what happens to their data
   * looks under their data.
   */
  const personal = (
    <>
      <Card className="mb-6">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Your details
        </h2>
        <EditProfile
          initial={{
            firstName: String(data.firstName ?? ''),
            middleName: String(data.middleName ?? ''),
            lastName: String(data.lastName ?? ''),
            suffix: String(data.suffix ?? ''),
            dateOfBirth: toDateInputValue(data.dateOfBirth),
            sex: String(data.sex ?? ''),
            mobile: String(data.mobile ?? ''),
          }}
          email={String(data.email ?? '—')}
        />
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
    </>
  );

  const security = (
    <Card>
      <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
        Change password
      </h2>
      <ChangePassword />
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="My Profile"
        description="Keep your details up to date. Your username and email address are permanent and cannot be changed."
      />

      <Tabs
        tabs={[
          { id: 'personal', label: 'Personal information', content: personal },
          { id: 'security', label: 'Password & security', content: security },
        ]}
      />
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
