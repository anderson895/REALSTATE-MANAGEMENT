import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../../under-development';

export default async function AccountingPaymentsPage() {
  await requireModule('PAYMENT');

  return (
    <UnderDevelopment
      title="Payments"
      module="PAYMENT"
      owners={['ACCOUNTING']}
      summary="Accounting's view of money already received — view, manage and print, per RBAC.xls. Deliberately without create: payments are raised at the counter or by the buyer, and reviewed here."
      planned={[
        'Every posted payment, filterable by period, project and channel.',
        'Reconciliation against the reservation each payment belongs to.',
        'Corrections to a mis-keyed reference or channel, attributed to whoever made them.',
        'Print, for the month-end file.',
      ]}
    />
  );
}
