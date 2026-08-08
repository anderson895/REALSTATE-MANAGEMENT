import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../under-development';

export default async function PaymentRecordsPage() {
  await requireModule('PAYMENT_RECORDS');

  return (
    <UnderDevelopment
      title="Payment Records"
      module="PAYMENT_RECORDS"
      owners={['CASH_CLERK']}
      summary="The counter's own record of money received: record it, acknowledge it, and reconcile the day. RBAC.xls gives the Cash Clerk record and monitor — not the power to clear a reservation, which stays with Billing."
      planned={[
        'Record a payment taken at the counter against a reservation number.',
        'Acknowledge receipt, which is what the buyer walks away holding.',
        'Daily collection summary, per channel, for the cash count at close.',
        'Hand-off to Accounting, which reviews the posted payments on its own screen.',
      ]}
    />
  );
}
