import Link from 'next/link';
import { headers } from 'next/headers';
import { AppShell } from '@sfsr/ui';
import { ROLE_LABELS, isInternalRole } from '@sfsr/domain';
import { requireEmployee } from '@/lib/session';
import { navigationFor } from '@/lib/navigation';
import { SignOutButton } from './sign-out-button';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireEmployee();
  const headerList = await headers();
  const currentPath = headerList.get('x-pathname') ?? '/';

  if (!isInternalRole(session.role)) {
    throw new Error(
      `Employee ${session.employeeId} has an unrecognised role "${session.role}". Re-run npm run seed:load.`,
    );
  }

  return (
    <AppShell
      brand="St. Francis Square Realty"
      subtitle="Internal Management System"
      sections={navigationFor(session.role)}
      currentPath={currentPath}
      LinkComponent={Link}
      footer={
        <div className="space-y-2">
          <div className="text-xs">
            <p className="font-medium text-neutral-700 dark:text-neutral-300">
              {session.employeeId}
            </p>
            <p className="text-neutral-500">
              {ROLE_LABELS[session.role]}
              {session.isSupervisor ? ' · Approver' : ''}
            </p>
          </div>
          <SignOutButton />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
