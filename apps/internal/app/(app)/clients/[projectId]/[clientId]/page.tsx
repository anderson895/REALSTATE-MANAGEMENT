import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Money, SALES_VISIBLE_STATUSES, type ReservationStatus } from '@sfsr/domain';
import {
  getAdminFirestore,
  getProject,
  getReservationDetail,
  listProjectMasterfiles,
} from '@sfsr/infrastructure/server';
import { requireModule } from '@/lib/session';
import { STATUS_LABELS, formatDate } from '@/lib/reservations';

/**
 * Client Master Files, page three — one buyer's file.
 *
 * note.txt: "View Profiles of buyers nandun lahat ng naka fillout sa
 * reservation niya."
 *
 * ── Two sources, kept apart on purpose ───────────────────────────────────
 *
 * The ACCOUNT section is the client document: what the buyer registered with
 * and can still edit from their own profile. The RESERVATION sections are what
 * they filled in at the time of that reservation and cannot revise — civil
 * status, TIN, the address, the payment terms.
 *
 * They are not merged into one list of facts, because they answer different
 * questions. "What is this person's mobile number today" is the account;
 * "what did they declare when they reserved A-102" is the reservation. A
 * Documentation reviewer needs the second, and a reviewer who cannot tell
 * which is which has neither.
 *
 * ── Scoped to this project ───────────────────────────────────────────────
 *
 * A buyer who bought in two projects has a file under each, showing only the
 * reservations for the one being viewed. Reached from the project's own list,
 * so showing units from elsewhere would answer a question nobody asked.
 *
 * COST: 1 client read, the project's approved set, and one detail load per
 * reservation this buyer holds here — almost always one.
 */
export default async function BuyerMasterFilePage({
  params,
}: {
  params: Promise<{ projectId: string; clientId: string }>;
}) {
  await requireModule('CLIENT_PROFILE');
  const { projectId, clientId } = await params;

  const db = getAdminFirestore();
  const [project, clientSnap, projectRows] = await Promise.all([
    getProject(db, projectId),
    db.collection('clients').doc(clientId).get(),
    listProjectMasterfiles(db, projectId, SALES_VISIBLE_STATUSES),
  ]);

  const mine = projectRows.filter((row) => row.clientId === clientId);
  // No approved reservation in this project means no master file here, whatever
  // the client document says — the file exists because somebody bought
  // something.
  if (!project || mine.length === 0) notFound();

  const client = clientSnap.data() ?? {};
  const details = await Promise.all(mine.map((row) => getReservationDetail(db, row.number)));

  const fullName =
    [client.firstName, client.middleName, client.lastName, client.suffix]
      .map((part) => (part == null ? '' : String(part).trim()))
      .filter((part) => part !== '')
      .join(' ') || mine[0]!.buyerName;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/clients/${projectId}`}
        className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-navy-700"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        {project.name}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">{fullName}</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 text-sm text-neutral-500">
          {mine.length} {mine.length === 1 ? 'unit' : 'units'} in {project.name}
        </p>
      </header>

      <Panel title="Account">
        <Field label="Full name" value={fullName} />
        <Field label="Username" value={String(client.username ?? '—')} />
        <Field label="Email address" value={String(client.email ?? '—')} />
        <Field label="Mobile number" value={String(client.mobile ?? '—')} />
        <Field label="Date of birth" value={asDate(client.dateOfBirth)} />
        <Field label="Sex" value={String(client.sex ?? '—')} />
        <Field label="Account type" value={client.tier === 'PERMANENT' ? 'Permanent Client' : 'Initial Account'} />
      </Panel>

      {details.map((detail, index) => {
        const row = mine[index]!;
        if (!detail) return null;
        const { reservation, buyer, payment, documents } = detail;

        return (
          <section key={row.number} className="mt-6">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold text-navy-800">
              <span className="tabular">{row.number}</span>
              <span className="text-neutral-400">·</span>
              <span>
                Unit {row.unitNo}
                {row.unitType ? ` · ${row.unitType}` : ''}
              </span>
              <span className="ml-auto text-xs font-medium text-neutral-500">
                {STATUS_LABELS[reservation.status as ReservationStatus] ?? reservation.status}
              </span>
            </h2>

            <Panel title="As declared on this reservation">
              <Field label="Civil status" value={buyer?.civilStatus ?? '—'} />
              <Field label="Nationality" value={buyer?.nationality ?? '—'} />
              <Field label="TIN" value={buyer?.tin ?? '—'} />
              <Field label="Contact number" value={buyer?.mobile ?? '—'} />
              <Field label="Address" value={buyer?.address ?? '—'} wide />
            </Panel>

            <Panel title="Terms" className="mt-4">
              <Field label="Reserved" value={reservation.reservedAt ? formatDate(reservation.reservedAt) : '—'} />
              <Field label="Down payment" value={String(reservation.downPaymentTier)} />
              <Field label="Payment term" value={String(reservation.paymentTerm)} />
              <Field label="Financing" value={String(reservation.financingOption)} />
              <Field label="Sales agent" value={reservation.salesAgentId ?? '—'} />
              <Field label="Parking slot" value={reservation.parkingSlotId ?? 'None'} />
            </Panel>

            {payment ? (
              <Panel title="Payment" className="mt-4">
                <Field label="Reference number" value={payment.referenceNumber || '—'} />
                <Field label="Channel" value={payment.channel || '—'} />
                <Field
                  label="Amount"
                  value={Money.fromCentavos(payment.amountCentavos).format()}
                />
                <Field label="Paid on" value={payment.paymentDate ? formatDate(payment.paymentDate) : '—'} />
                <Field label="Status" value={payment.status || '—'} />
                <Field label="Receipt" value={payment.receipt?.fileName ?? 'Not uploaded'} />
              </Panel>
            ) : null}

            <Panel title="Documents submitted" className="mt-4" plain>
              {documents.length === 0 ? (
                <p className="px-5 py-3 text-sm text-neutral-500">Nothing uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {documents.map((doc) => (
                    <li
                      key={`${doc.docType}-${doc.frontFile?.publicId ?? doc.docType}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-sm"
                    >
                      <span className="font-medium text-neutral-700">
                        {doc.docType}
                        {doc.idType ? (
                          <span className="ml-1.5 text-xs font-normal text-neutral-500">
                            {doc.idType}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {[doc.frontFile?.fileName, doc.backFile?.fileName]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                        {doc.status ? ` · ${doc.status}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <p className="mt-3 text-xs text-neutral-400">
              The full verification trail, the ID images and the actions available on this
              reservation are on{' '}
              <Link
                href={`/reservations/${row.number}`}
                className="font-medium text-navy-700 underline-offset-2 hover:underline"
              >
                its own page
              </Link>
              .
            </p>
          </section>
        );
      })}
    </div>
  );
}

/** Stored as `YYYY-MM-DD` by registration, as a Timestamp by the walk-in desk. */
function asDate(value: unknown): string {
  if (value == null) return '—';
  const date =
    typeof (value as { toDate?: () => Date }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Panel({
  title,
  children,
  className = '',
  /** Documents render their own list, not a definition list of fields. */
  plain = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  plain?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm ${className}`}
    >
      <header className="border-b border-neutral-200/80 px-5 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">{title}</h3>
      </header>
      {plain ? children : <dl className="grid sm:grid-cols-2">{children}</dl>}
    </section>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`px-5 py-2.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{value}</dd>
    </div>
  );
}
