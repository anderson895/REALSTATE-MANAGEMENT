import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, EmptyState, PageHeader, StatusBadge } from '@sfsr/ui';
import { requireClient } from '@/lib/session';
import { DeficiencyResponse } from './deficiency-response';

export const metadata: Metadata = { title: 'My Reservations' };

/** RESERVATION.doc, STEP 2. Non-refundable — clause 4. */
const RESERVATION_FEE_CENTAVOS = 5_000_000;

interface ReservationRow {
  readonly number: string;
  readonly unitId: string;
  readonly status: string;
  readonly reservedAt: Date | null;
  readonly downPaymentTier: number;
  /** Set when the buyer sends a correction back. Drives the receipt panel. */
  readonly deficiencyRespondedAt: Date | null;
  /**
   * What a reviewer actually wrote, and by when it must be fixed.
   *
   * The status alone said "Something needs correcting" and stopped there, so a
   * buyer had 24 hours to guess WHICH thing. The internal form that captures
   * this is labelled "The buyer sees this and has 24 hours to respond" — it
   * was not being shown to them at all.
   */
  readonly deficiencyReason: string | null;
  readonly deficiencyDueAt: Date | null;
}

/** How each workflow status reads to a buyer, who should not see internal jargon. */
const BUYER_STATUS: Record<string, { label: string; detail: string }> = {
  PendingPaymentVerification: {
    label: 'Pending Payment Verification',
    detail: 'Our Account Receivables team is verifying your reservation fee.',
  },
  PaymentVerified: {
    label: 'Payment Verified',
    detail: 'Your unit is on hold. Documentary requirements are being reviewed.',
  },
  DocumentsVerified: {
    label: 'Documents Verified',
    detail: 'Awaiting final approval from the supervising officer.',
  },
  Approved: {
    label: 'Approved',
    detail: 'Your reservation is approved. We will contact you for contract signing.',
  },
  ContractSigned: {
    label: 'Contract Signed',
    detail: 'Your Permanent Client Account is being prepared.',
  },
  Completed: { label: 'Completed', detail: 'Your Permanent Client Account is active.' },
  DeficiencyNoted: {
    label: 'Action Required',
    // The specifics come from `deficiencyReason` on the record itself, shown
    // in the panel below the card. This line only sets the scene.
    detail: 'Our team found something that needs correcting before we can continue.',
  },
  Expired: {
    label: 'Expired',
    detail: 'The response window lapsed. Our team will review your reservation.',
  },
  Cancelled: { label: 'Cancelled', detail: 'This reservation was cancelled.' },
};

export default async function MyReservationsPage() {
  const session = await requireClient();

  // COST: one read per reservation the buyer owns — typically 0 or 1.
  // Not cached: a buyer refreshing this page is checking whether their status
  // moved, and serving them a minute-old answer defeats the purpose.
  const snap = await getAdminFirestore()
    .collection('reservations')
    .where('clientId', '==', session.uid)
    .orderBy('reservedAt', 'desc')
    .limit(20)
    .get();

  const reservations: ReservationRow[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      number: doc.id,
      unitId: String(data.unitId ?? ''),
      status: String(data.status ?? ''),
      reservedAt: data.reservedAt?.toDate?.() ?? null,
      downPaymentTier: Number(data.downPaymentTier ?? 0),
      deficiencyRespondedAt: data.deficiencyRespondedAt?.toDate?.() ?? null,
      deficiencyReason: data.deficiencyReason ? String(data.deficiencyReason) : null,
      deficiencyDueAt: data.deficiencyDueAt?.toDate?.() ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/*
       * No "Browse Units" button here any more.
       *
       * comments.doc: "Padelete nalang po nung browse unit. Same lang kasi sya
       * sa browse condominium projects." Both went to `/projects` under two
       * different names, which is worse than a duplicate — it implies two
       * destinations and delivers one. The empty state below keeps the single
       * honest wording, and the sidebar carries both routes regardless.
       */}
      <PageHeader
        title="My Reservations"
        description="Track every reservation you have submitted, from application through to Contract to Sell."
      />

      {reservations.length === 0 ? (
        <EmptyState
          title="No reservations yet"
          description="When you reserve a unit, it will appear here with its verification status, payment schedule, and documentary requirements."
          actionHref="/projects"
          actionLabel="Browse Condominium Projects"
        />
      ) : (
        <div className="space-y-4">
          {reservations.map((reservation) => {
            const meaning = BUYER_STATUS[reservation.status] ?? {
              label: reservation.status,
              detail: '',
            };
            return (
              <Card key={reservation.number} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{reservation.number}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Unit {reservation.unitId}
                      {reservation.reservedAt
                        ? ` · reserved ${reservation.reservedAt.toLocaleDateString('en-PH', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}`
                        : ''}
                    </p>
                  </div>
                  <StatusBadge status={meaning.label} />
                </div>

                {meaning.detail ? (
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                    {meaning.detail}
                  </p>
                ) : null}

                <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
                  <div>
                    <dt className="text-neutral-400">Down payment</dt>
                    <dd className="mt-0.5 font-medium">{reservation.downPaymentTier}%</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Reservation fee</dt>
                    <dd className="tabular mt-0.5 font-medium">
                      {Money.fromCentavos(RESERVATION_FEE_CENTAVOS).format()}
                    </dd>
                  </div>
                </dl>

                {/*
                  * The actual deficiency, in the reviewer's own words.
                  *
                  * Amber and above the withdrawal notice because it is the one
                  * thing on this page the buyer has to ACT on, and the clock is
                  * running. The deadline is spelled out with a time, not "24
                  * hours" — a buyer reading this at 11pm needs to know whether
                  * that means tonight or tomorrow.
                  */}
                {reservation.status === 'DeficiencyNoted' && reservation.deficiencyReason ? (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3">
                    <p className="text-sm font-semibold text-amber-900">What needs correcting</p>
                    <p className="mt-1 text-sm text-amber-900">{reservation.deficiencyReason}</p>
                    {reservation.deficiencyDueAt ? (
                      <p className="mt-2 text-xs text-amber-800">
                        Please respond by{' '}
                        <span className="font-semibold">
                          {reservation.deficiencyDueAt.toLocaleString('en-PH', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'Asia/Manila',
                          })}
                        </span>
                        .
                      </p>
                    ) : null}

                    <DeficiencyResponse
                      reservationNumber={reservation.number}
                      respondedAt={reservation.deficiencyRespondedAt}
                    />
                  </div>
                ) : null}

              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
