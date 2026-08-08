import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { canAccessModule } from '@sfsr/domain';
import {
  getAdminFirestore,
  getReservationDetail,
  resolveEmployeeNames,
  signedUrlFor,
  type ReservationDocument,
  type UploadedFileRef,
} from '@sfsr/infrastructure/server';
import { Card, PageHeader } from '@sfsr/ui';
import { requireEmployee, toActor } from '@/lib/session';
import {
  ACTION_LABELS,
  actionsFor,
  canTakeAction,
  formatCentavos,
  formatDate,
  refusalFor,
  waitingOn,
  type ReservationAction,
} from '@/lib/reservations';
import { processReservation } from '../actions';
import { ConfirmSubmit } from '../confirm-submit';
import { ActionNotice } from '../notice';
import { LifecycleStepper, ReservationBadge } from '../status';
import { VerificationTrail } from '../trail';

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
/**
 * What each attestation actually claims.
 *
 * Written as the checks a reviewer should have made, not as "are you sure" —
 * a question that stops being read somewhere around the tenth reservation.
 * Each list is the thing the person is putting their name to.
 */
type ConfirmableAction = Exclude<ReservationAction, 'noteDeficiency'>;

const CONFIRM_COPY: Record<ConfirmableAction, { title: string; points: readonly string[] }> = {
  verifyPayment: {
    title: 'Confirm the payment cleared?',
    points: [
      'The amount and reference number match the uploaded receipt.',
      'The payment appears in the company bank account, not just on the receipt.',
      'This is half of what the final approval rests on.',
    ],
  },
  verifyDocuments: {
    title: 'Confirm the ID checks out?',
    points: [
      'The name on the ID matches the buyer on this reservation.',
      'Both sides are legible and the ID has not expired.',
      'The images are of the original, not a photocopy of one.',
    ],
  },
  markExpired: {
    title: 'Mark this reservation expired?',
    points: [
      'The buyer did not respond within 24 hours of the deficiency notice.',
      'It moves to the Expired Reservation Report. This does NOT cancel it.',
      'Cancelling is a separate step and needs a second person to approve.',
    ],
  },
  approve: {
    title: 'Approve this reservation?',
    points: [
      'Billing and Documentation have both signed off — check the trail above.',
      'The unit leaves inventory and is marked Sold the moment you confirm.',
      'This is the final stage of the transaction.',
    ],
  },
};

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

  // COST: one getAll for the whole trail — usually one or two distinct people,
  // and zero reads on a reservation nobody has touched yet.
  /*
   * The buyer's registered name, shown beside the ID.
   *
   * "dapat match ang ID sa name ng client" — a reviewer cannot check that
   * against a name they have to remember from another screen. One read.
   */
  const buyerSnap = await getAdminFirestore()
    .collection('clients')
    .doc(reservation.clientId)
    .get();
  const buyerData = buyerSnap.data();
  const buyerName = buyerData
    ? [buyerData.firstName, buyerData.middleName, buyerData.lastName, buyerData.suffix]
        .map((part) => (part == null ? '' : String(part).trim()))
        .filter((part) => part !== '')
        .join(' ')
    : reservation.clientId;

  const names = await resolveEmployeeNames(getAdminFirestore(), [
    reservation.paymentVerifiedBy,
    reservation.documentsVerifiedBy,
    reservation.approvedBy,
  ]);

  // Drawn only for actions this employee may actually take. The same check
  // runs again inside the server action — hiding a button is not a control.
  const offered = actionsFor(reservation);
  const available = offered.filter((action) => canTakeAction(actor, action));
  const primary = available.filter(
    (action): action is ConfirmableAction => action !== 'noteDeficiency',
  );
  const waitingFor = waitingOn(reservation.status, reservation);

  /*
   * This record needs a check that is this actor's own desk's work, and they
   * are barred from it only because they are the one who signs it off.
   *
   * Worth its own sentence: without it a Documentation Supervisor was told
   * "Verified on your side. Now with Documentation" — while being Documentation
   * and having verified nothing. That reads as a broken screen rather than as
   * the four-eyes rule doing exactly what the client asked for.
   */
  const heldForStaff = offered.some(
    (action) => refusalFor(actor, action) === 'approverMayNotVerify',
  );

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

      {/* Above the evidence, not below it: a supervisor opening this record is
          deciding whether to sign, and the first question is whether the other
          two desks have finished. */}
      <div className="mb-6">
        <VerificationTrail reservation={reservation} names={names} />
      </div>

      {reservation.status === 'DeficiencyNoted' ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-medium">Deficiency noted — waiting on the buyer</p>
          <p className="mt-1">{reservation.deficiencyReason}</p>
          <p className="mt-2 text-xs text-amber-700">
            They have until {formatDate(reservation.deficiencyDueAt)} to respond. After that the
            reservation can be moved to the Expired Reservation Report.
          </p>
          {/* The buyer coming back does not change the status — only a desk
              re-verifying does — so without this the corrected file would sit
              in the queue looking exactly like an unanswered notice. */}
          {reservation.deficiencyRespondedAt ? (
            <p className="mt-2 rounded-md bg-emerald-100 px-2.5 py-1.5 text-xs font-medium text-emerald-900">
              Buyer sent a correction on {formatDate(reservation.deficiencyRespondedAt)} — check
              the documents below and verify again.
            </p>
          ) : null}
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

                    {doc.replacesDeficiency ? (
                      <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        Sent by the buyer in answer to: “{doc.replacesDeficiency}”
                      </p>
                    ) : null}

                    <NameCheck check={doc.nameCheck} buyerName={buyerName} />

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
                {primary.length === 0 && heldForStaff ? (
                  <p className="text-sm text-neutral-500">
                    Your signature is the{' '}
                    <span className="font-medium text-neutral-700">final approval</span>, so the
                    checks themselves are for staff to make. This comes back to you once
                    Billing and Documentation have both signed.
                  </p>
                ) : primary.length === 0 && waitingFor ? (
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
                    <ConfirmSubmit
                      label={ACTION_LABELS[action]}
                      title={CONFIRM_COPY[action].title}
                      points={CONFIRM_COPY[action].points}
                      actor={session.displayName}
                      tone={action === 'approve' ? 'gold' : 'navy'}
                    />
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
          className="shrink-0 text-xs text-navy-700 hover:underline"
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
          className="block rounded-md border border-neutral-200 px-4 py-6 text-center text-xs text-navy-700 hover:underline"
        >
          {file.fileName}
        </a>
      )}
    </figure>
  );
}

/**
 * The automated name comparison, next to the card it was run against.
 *
 * ── Why a warning and not a block ────────────────────────────────────────
 *
 * `validateIdUpload` refuses the wrong KIND of card outright — that is a fact
 * about a document. Whether the NAME matches is a judgement, and OCR misreads
 * names constantly: "Ma. Cristina" against "MARIA CRISTINA", a maiden name on
 * an older card, a middle initial the card omits. Blocking on it would turn
 * away real buyers holding perfectly good documents.
 *
 * So the machine states what it found and the reviewer decides. What changed
 * is that the finding now reaches them at all — it used to be computed in the
 * buyer's browser, shown once, and discarded.
 *
 * The registered name is printed whether or not the check ran, because the
 * reviewer's actual job is to compare it with the card in front of them, and a
 * name they have to remember from another screen is one they will not check.
 */
function NameCheck({
  check,
  buyerName,
}: {
  check: ReservationDocument['nameCheck'];
  buyerName: string;
}) {
  const tone =
    check?.verdict === 'match'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : check?.verdict === 'mismatch'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`mb-3 rounded-md border px-3 py-2.5 text-xs ${check ? tone : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
      <p className="font-semibold">
        {check?.verdict === 'match'
          ? 'Name matched the account'
          : check?.verdict === 'mismatch'
            ? 'Name did NOT match the account'
            : check?.verdict === 'review'
              ? 'Name needs a human look'
              : 'No automated name check on file'}
      </p>

      <dl className="mt-1.5 space-y-0.5">
        <div className="flex gap-1.5">
          <dt className="shrink-0 opacity-70">Account name:</dt>
          <dd className="font-medium">{buyerName}</dd>
        </div>
        {check ? (
          <>
            <div className="flex gap-1.5">
              <dt className="shrink-0 opacity-70">Read from the ID:</dt>
              <dd className="min-w-0 break-words font-medium">
                {check.readName.trim() === '' ? '— nothing readable —' : check.readName}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 opacity-70">Similarity:</dt>
              <dd className="tabular font-medium">{Math.round(check.similarity * 100)}%</dd>
            </div>
          </>
        ) : null}
      </dl>

      <p className="mt-1.5 opacity-80">
        {check
          ? 'A guide only — OCR misreads names. Compare the images yourself before verifying.'
          : 'This reservation predates the check, or it could not run. Compare by eye.'}
      </p>
    </div>
  );
}
