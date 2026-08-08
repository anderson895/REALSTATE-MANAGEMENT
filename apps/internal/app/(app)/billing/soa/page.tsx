import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../../under-development';

export default async function SoaPage() {
  await requireModule('SOA_GENERATION');

  return (
    <UnderDevelopment
      title="Statements of Account"
      module="SOA_GENERATION"
      owners={['BILLING']}
      summary="Generate, send and print a Statement of Account. RBAC.xls gives Billing create, modify, delete, view and send here — sending is the part no other finance role has."
      planned={[
        'Generate an SOA from an approved reservation, using the same PricingService the Portal quotes from.',
        'The amortisation schedule behind the net down payment and the balance on total purchase price.',
        'Send to the buyer, who reads it under Permanent Client access on the Portal.',
        'Print and reissue, with the reissue recorded rather than silently overwriting the original.',
      ]}
    />
  );
}
