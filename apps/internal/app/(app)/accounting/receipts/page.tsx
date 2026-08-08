import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../../under-development';

export default async function OfficialReceiptsPage() {
  await requireModule('OFFICIAL_RECEIPT');

  return (
    <UnderDevelopment
      title="Official Receipts"
      module="OFFICIAL_RECEIPT"
      owners={['ACCOUNTING', 'CASH_CLERK']}
      summary="Issue and reprint official receipts against verified payments. Two roles share this module and hold it differently — the Cash Clerk may create one, Accounting may amend one."
      planned={[
        'Issue an OR against a payment Billing has already verified.',
        'Sequential OR numbering, allocated the same way reservation numbers are so the series cannot fork.',
        'Reprint, marked as a reprint rather than passing for an original.',
        'Void with a reason, since an OR is never simply deleted.',
      ]}
    />
  );
}
