import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../under-development';

export default async function LoanMonitoringPage() {
  await requireModule('PAYMENT_MONITORING');

  return (
    <UnderDevelopment
      title="Loan Monitoring"
      module="PAYMENT_MONITORING"
      owners={['LOAN_OFFICER']}
      summary="Accounts due for loan application, per RBAC.xls: monitor and report. Read-only by design — the Loan Officer watches the pipeline and does not move money through it."
      planned={[
        'Reservations whose financing option is Bank or Pag-IBIG, and where each sits in the application.',
        'Accounts approaching the end of their down payment term, which is when the loan has to be filed.',
        'The client profile behind each, view-only, as the matrix grants.',
        'A printable report — the only output this role is given.',
      ]}
    />
  );
}
