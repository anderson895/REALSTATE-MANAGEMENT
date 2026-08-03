import Link from 'next/link';
import type { Metadata } from 'next';
import { Money, canRequestWithdrawal } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, EmptyState, PageHeader, StatusBadge } from '@sfsr/ui';
import { requireClient } from '@/lib/session';
import { WithdrawButton } from './withdraw-button';

export const metadata: Metadata = { title: 'My Reservations' };

/** RESERVATION.doc, STEP 2. Non-refundable — clause 4. */
const RESERVATION_FEE_CENTAVOS = 5_000_000;

interface ReservationRow {
  readonly number: string;
  readonly unitId: string;
  readonly status: string;
  readonly reservedAt: Date | null;
  readonly downPaymentTier: number;
  readonly withdrawalRequestedAt: Date | null;
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
    detail: 'Something needs correcting. You have 24 hours from the notice to respond.',
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
      withdrawalRequestedAt: data.withdrawalRequestedAt?.toDate?.() ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        title="My Reservations"
        description="Track every reservation you have submitted, from application through to Contract to Sell."
        action={
          <Link
            href="/projects"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Browse Units
          </Link>
        }
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

                {reservation.withdrawalRequestedAt ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3">
                    <p className="text-sm font-medium text-amber-900">
                      Withdrawal requested{' '}
                      {reservation.withdrawalRequestedAt.toLocaleDateString('en-PH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Our team will contact you. Until then the reservation continues through its
                      normal review, and your{' '}
                      {Money.fromCentavos(RESERVATION_FEE_CENTAVOS).format()} fee remains
                      non-refundable.
                    </p>
                  </div>
                ) : canRequestWithdrawal(reservation.status) ? (
                  <div className="mt-4 flex justify-end">
                    <WithdrawButton
                      reservationNumber={reservation.number}
                      reservationFeeCentavos={RESERVATION_FEE_CENTAVOS}
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
