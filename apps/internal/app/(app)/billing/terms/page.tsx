import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../../under-development';

export default async function PaymentTermsPage() {
  await requireModule('PAYMENT_TERM_MONITORING');

  return (
    <UnderDevelopment
      title="Payment Terms"
      module="PAYMENT_TERM_MONITORING"
      owners={['BILLING']}
      summary="Where each buyer stands against the terms they agreed to — down payment instalments, due dates, and what is left on the total purchase price."
      planned={[
        'Down payment schedule per reservation, over the 6, 12, 18, 24, 30 or 36-month term chosen at step 3.',
        'Paid, due and overdue instalments at a glance, oldest arrears first.',
        'The financing option on file, so a bank-financed balance is not chased like an in-house one.',
        'Follow-up notices to buyers who have fallen behind.',
      ]}
    />
  );
}
