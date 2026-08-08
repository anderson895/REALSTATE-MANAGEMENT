import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../under-development';

export default async function ReportsPage() {
  await requireModule('REPORTS');

  return (
    <UnderDevelopment
      title="Reports"
      module="REPORTS"
      owners={['ACCOUNT_RECEIVABLES']}
      summary="Management reporting on reservations and sales — the operational counterpart to Accounting's financial reports, held by Account Receivables."
      planned={[
        'Reservations by status, project and period, from submission through to contract signed.',
        'Sales by agent, broker and group head, derived from the sales organisation on each reservation.',
        'Conversion: trippings requested against reservations filed against reservations approved.',
        'Cancellations and expiries with their stated reasons.',
      ]}
    />
  );
}
