import { requireModule } from '@/lib/session';
import { UnderDevelopment } from '../under-development';

/**
 * The audit trail READER.
 *
 * Worth being clear about what is and is not missing here: the trail itself
 * already exists and is already being written. `auditLogs` collects every
 * verification, every approval, every account User Management opens and every
 * announcement Marketing posts, inside the same transaction as the change it
 * describes. What has not been built is the screen that reads it back.
 *
 * So this placeholder is not standing in for a feature that does not exist —
 * it is standing in for a window onto data that is accumulating right now.
 */
export default async function AuditTrailPage() {
  await requireModule('AUDIT_TRAIL');

  return (
    <UnderDevelopment
      title="Audit Trail"
      module="AUDIT_TRAIL"
      owners={['IT_ADMINISTRATOR', 'ACCOUNT_RECEIVABLES']}
      summary="Entries are already being recorded — every verification, approval, new account and announcement writes one as it happens. This is the screen that reads them back, and it is not built yet."
      planned={[
        'The append-only log, newest first, filterable by actor, entry type and date.',
        'note.txt asks for two of them by name: which staff member verified, and which supervisor approved.',
        'Account events from User Management — who opened an internal account, and with what role.',
        'Print, which RBAC.xls grants both roles holding this module.',
        'No edit and no delete, here or anywhere: the Security Rules refuse update and delete on auditLogs to every role, including IT.',
      ]}
    />
  );
}
