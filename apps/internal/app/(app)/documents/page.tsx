import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../under-development';

export default async function DocumentaryRequirementsPage() {
  await requireModule('DOCUMENTARY_REQUIREMENTS');

  return (
    <UnderDevelopment
      title="Documentary Requirements"
      module="DOCUMENTARY_REQUIREMENTS"
      owners={['DOCUMENTATION']}
      summary="The post-reservation paperwork a buyer still owes, per RESERVATION.doc step 6. The government ID submitted WITH a reservation is already verified on the Reservations screen — this is everything that follows it."
      planned={[
        'A checklist per buyer: BIR Form 1904 / TIN, proof of billing, COE or proof of income, marriage certificate, SPA, and other supporting documents.',
        'Review of each upload, with accept and return-for-correction.',
        'Deficiency notices carrying a due date, which the buyer answers from the Portal.',
        'The outstanding-items view a Documentation Supervisor needs before final approval.',
      ]}
    />
  );
}
