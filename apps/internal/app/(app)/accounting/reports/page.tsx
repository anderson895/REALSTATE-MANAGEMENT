import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../../under-development';

export default async function FinancialReportsPage() {
  await requireModule('FINANCIAL_REPORTS');

  return (
    <UnderDevelopment
      title="Financial Reports"
      module="FINANCIAL_REPORTS"
      owners={['ACCOUNTING']}
      summary="Collections, receivables and sales value, summarised for the period. RBAC.xls: monitor collections and generate financial reports."
      planned={[
        'Collections by period, project and payment channel.',
        'Reservation fees held against reservations not yet approved, which are not yet revenue.',
        'Outstanding receivables, reconciled with what Payment Terms is chasing.',
        'Export and print, so the figures leave the system in the shape Accounting files them.',
      ]}
    />
  );
}
