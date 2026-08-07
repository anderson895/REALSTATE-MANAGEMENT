import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { canAccessModule, can } from '@sfsr/domain';
import {
  getAdminFirestore,
  getReservationDetail,
  signedUrlFor,
  type UploadedFileRef,
} from '@sfsr/infrastructure/server';
import { Card, PageHeader } from '@sfsr/ui';
import { requireEmployee, toActor } from '@/lib/session';
import {
  ACTION_LABELS,
  actionsFor,
  formatCentavos,
  formatDate,
  moduleFor,
  waitingOn,
} from '@/lib/reservations';
import { processReservation } from '../actions';
import { ActionNotice } from '../notice';
import { LifecycleStepper, ReservationBadge } from '../status';

/**
 * One reservation, with the evidence and the decision on the same screen.
 *
 * The two-column split is the whole point of the layout: the evidence column
 * scrolls while the decision panel stays pinned beside it. Stacked, a reviewer
 * had to scroll past the receipt and both sides of the ID to reach the buttons,
 * then scroll back up to check what they had just agreed to.
 *
 * Deliberately not gated on RESERVATION_VERIFICATION alone. Per the RBAC
 * matrix that module belongs to Documentation, while the supervisor who
 * approves sits in Account Receivables under APPROVAL_MONITORING — requiring
 * the first would lock the approver out of the record they must approve.
 * Either grant opens the page; each individual action is re-checked on its own.
 */
export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { number } = await params;
  const { error, done } = await searchParams;

  const session = await requireEmployee();
  const actor = toActor(session);
  if (
    !canAccessModule(actor, 'RESERVATION_VERIFICATION') &&
    !canAccessModule(actor, 'APPROVAL_MONITORING')
  ) {
    redirect('/?denied=RESERVATION_VERIFICATION');
  }

  // Account Receivables reaches this record from /approvals and has no grant
  // on /reservations, so sending everyone "back" to the verification queue
  // would bounce the approver off a page they are not allowed to open.
  const backHref = canAccessModule(actor, 'RESERVATION_VERIFICATION')
    ? '/reservations'
    : '/approvals';

  const detail = await getReservationDetail(getAdminFirestore(), number);
  if (!detail) notFound();

  const { reservation, buyer, payment, documents } = detail;

  // Drawn only for actions this employee may actually take. The same check
  // runs again inside the server action — hiding a button is not a control.
  const available = actionsFor(reservation.status).filter((action) =>
    can(actor, moduleFor(action), action === 'approve' ? 'approve' : 'modify'),
  );
  const primary = available.filter((action) => action !== 'noteDeficiency');
  const waitingFor = waitingOn(reservation.status);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link href={backHref} className="text-xs text-neutral-500 hover:underline">
        ← Back to queue
      </Link>

      <div className="mt-3">
        <PageHeader
          title={reservation.number}
          description={`Unit ${reservation.unitId}${
            reservation.parkingSlotId ? ` · Parking ${reservation.parkingSlotId}` : ''
          } · Submitted ${formatDate(reservation.reservedAt)}`}
          action={<ReservationBadge status={reservation.status} />}
        />
      </div>

      <ActionNotice error={error} done={done} />

      <Card className="mb-6 px-5 py-3.5">
        <LifecycleStepper status={reservation.status} />
      </Card>

      {reservation.status === 'DeficiencyNoted' ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-medium">Deficiency noted — waiting on the buyer</p>
          <p className="mt-1">{reservation.deficiencyReason}</p>
          <p className="mt-2 text-xs text-amber-700">
            They have until {formatDate(reservation.deficiencyDueAt)} to respond. After that the
            reservation can be moved to the Expired Reservation Report.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Evidence ───────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Proof of payment">
            {payment ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
                  <p className="tabular text-2xl font-semibold">
                    {formatCentavos(payment.amountCentavos)}
                  </p>
                  <span className="text-xs text-neutral-500">{payment.status}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 border-t border-neutral-200 px-5 py-3 sm:grid-cols-3">
                  <Compact label="Reference">{payment.referenceNumber}</Compact>
                  <Compact label="Channel">{payment.channel}</Compact>
                  <Compact label="Paid on">{formatDate(payment.paymentDate)}</Compact>
                </dl>
                <div className="border-t border-neutral-200 px-5 py-4">
                  <AssetPreview file={payment.receipt} label="Receipt" />
                </div>
              </>
            ) : (
              <p className="px-5 py-4 text-sm text-neutral-500">No payment record attached.</p>
            )}
          </Section>

          <Section title="Documentary requirements">
            {documents.length === 0 ? (
              <p className="px-5 py-4 text-sm text-neutral-500">Nothing uploaded yet.</p>
            ) : (
              <div className="divide-y divide-neutral-200">
                {documents.map((doc, index) => (
                  <div key={index} className="px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{doc.idType ?? doc.docType}</p>
                      <span className="text-xs text-neutral-500">{doc.status}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AssetPreview file={doc.frontFile} label="Front" />
                      <AssetPreview file={doc.backFile} label="Back" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Buyer">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-3">
              <Compact label="Mobile">{buyer?.mobile ?? '—'}</Compact>
              <Compact label="Civil status">{buyer?.civilStatus ?? '—'}</Compact>
              <Compact label="Nationality">{buyer?.nationality ?? '—'}</Compact>
              <Compact label="TIN">{buyer?.tin ?? '—'}</Compact>
              <Compact label="Sales agent">{reservation.salesAgentId ?? 'None recorded'}</Compact>
              <Compact label="Client ID">
                <span className="font-mono text-xs break-all">{reservation.clientId}</span>
              </Compact>
              <div className="col-span-2 sm:col-span-3">
                <Compact label="Address">{buyer?.address ?? '—'}</Compact>
              </div>
            </dl>
          </Section>
        </div>

        {/* ── Decision, pinned beside the evidence ───────────────────── */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Section title="Decision">
            {available.length === 0 ? (
              <div className="px-5 py-4 text-sm text-neutral-500">
                <p>
                  {reservation.status === 'Approved'
                    ? 'Approved. The unit has left inventory and is now marked Sold.'
                    : // split(' '), not split('') — the empty separator splits
                      // into CHARACTERS, so this addressed "Joanna Flores" as "J".
                      `Nothing for ${session.displayName.split(' ')[0]} to do at this stage.`}
                </p>
                {waitingFor ? (
                  <p className="mt-2">
                    Waiting on{' '}
                    <span className="font-medium text-neutral-700">
                      {waitingFor}
                    </span>
                    .
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 px-5 py-4">
                {/* Nothing to advance, but a deficiency can still be raised.
                    Without this the panel showed a lone "something is wrong"
                    toggle and no hint that the record had moved on to another
                    department. */}
                {primary.length === 0 && waitingFor ? (
                  <p className="text-sm text-neutral-500">
                    Verified on your side. Now with{' '}
                    <span className="font-medium text-neutral-700">
                      {waitingFor}
                    </span>
                    .
                  </p>
                ) : null}

                {primary.map((action) => (
                  <form key={action} action={processReservation}>
                    <input type="hidden" name="number" value={reservation.number} />
                    <input type="hidden" name="action" value={action} />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      {ACTION_LABELS[action]}
                    </button>
                  </form>
                ))}

                {available.includes('noteDeficiency') ? (
                  // Collapsed by default: rejecting is the exception, and an
                  // always-open textarea gave the secondary path the same
                  // visual weight as the one taken most of the time.
                  <details
                    className={
                      primary.length > 0
                        ? 'group border-t border-neutral-200 pt-3'
                        : 'group'
                    }
                  >
                    <summary className="cursor-pointer list-none text-sm text-neutral-600 hover:text-neutral-900">
                      <span className="group-open:hidden">▸ Something is wrong with this</span>
                      <span className="hidden group-open:inline">▾ Note a deficiency</span>
                    </summary>
                    <form action={processReservation} className="mt-3 space-y-2">
                      <input type="hidden" name="number" value={reservation.number} />
                      <input type="hidden" name="action" value="noteDeficiency" />
                      <label htmlFor="reason" className="block text-xs text-neutral-500">
                        The buyer sees this and has 24 hours to respond.
                      </label>
                      <textarea
                        id="reason"
                        name="reason"
                        rows={3}
                        required
                        placeholder="e.g. Back of the government ID is unreadable."
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                      >
                        {ACTION_LABELS.noteDeficiency}
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            )}
          </Section>

          <Section title="Terms">
            <dl className="space-y-3 px-5 py-4">
              <Compact label="Down payment">{reservation.downPaymentTier}%</Compact>
              <Compact label="Payment term">
                {reservation.paymentTerm === 'Spot Cash'
                  ? 'Spot Cash'
                  : `${reservation.paymentTerm} months`}
              </Compact>
              <Compact label="Financing">{reservation.financingOption}</Compact>
              <Compact label="Document deadline">
                {formatDate(reservation.documentDeadline)}
              </Compact>
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Compact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * An uploaded file, shown rather than linked where it can be.
 *
 * Verifying a payment means reading the amount off the receipt, so a link
 * labelled "payment.png" put the actual work one extra click away. Uploads are
 * `authenticated` Cloudinary assets, so both the preview and the full-size link
 * are signed and expire in five minutes — long enough to read, short enough
 * that a pasted URL is useless by the time it leaves the building.
 */
function AssetPreview({ file, label }: { file: UploadedFileRef | null; label: string }) {
  if (!file) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-xs text-neutral-400">
        {label} — not uploaded
      </div>
    );
  }

  const full = signedUrlFor(file.publicId);
  const isImage = file.mimeType.startsWith('image/');

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        <a
          href={full}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-brand-700 hover:underline"
        >
          Full size ↗
        </a>
      </figcaption>
      {isImage ? (
        <a href={full} target="_blank" rel="noreferrer" className="block">
          {/* Cloudinary already resizes and re-encodes on delivery, so the
              Next.js optimiser would only add a second hop — and it cannot
              cache a URL that expires in five minutes anyway. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrlFor(file.publicId, { width: 640 })}
            alt={`${label} — ${file.fileName}`}
            className="max-h-64 w-full rounded-md border border-neutral-200 bg-neutral-50 object-contain"
          />
        </a>
      ) : (
        <a
          href={full}
          target="_blank"
          rel="noreferrer"
          className="block rounded-md border border-neutral-200 px-4 py-6 text-center text-xs text-brand-700 hover:underline"
        >
          {file.fileName}
        </a>
      )}
    </figure>
  );
}
