import type { Metadata } from 'next';
import { clientCan } from '@sfsr/domain';
import { EmptyState, LockedState, PageHeader } from '@sfsr/ui';
import { requireClient } from '@/lib/session';

export const metadata: Metadata = { title: 'Payment History' };

export default async function PaymentsPage() {
  const session = await requireClient();

  if (!clientCan(session.tier, 'viewOwnPayments')) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader title="Payment History" />
        <LockedState
          title="Available to Permanent Clients"
          description="Your payment history shows every payment received, the official receipt issued for it, and how it was applied to your account."
          requirement="Your Permanent Client Account is issued by our Documentation Department once your reservation is approved and your Contract to Sell has been signed."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        title="Payment History"
        description="Every payment received and the official receipt issued for it."
      />
      <EmptyState
        title="No payments recorded yet"
        description="Payments appear here once the Cash Department has acknowledged them and issued an official receipt. Submitting proof of payment does not by itself confirm a payment."
      />
    </div>
  );
}
