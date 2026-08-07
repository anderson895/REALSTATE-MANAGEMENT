import { headers } from 'next/headers';
import { AppShell } from '@sfsr/ui';
import { ROLE_LABELS, isInternalRole } from '@sfsr/domain';
import { requireEmployee } from '@/lib/session';
import { navigationFor } from '@/lib/navigation';
import { SignOutButton } from './sign-out-button';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

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
      // An IT Administrator holds every module: nineteen items over five
      // groups, long enough that the group being worked in scrolls out of
      // sight. Only the group holding the current page starts open.
      collapsibleSections
      footer={
        // Name first, then role, then the employee ID. Leading with "EMP012"
        // made the sidebar address a record rather than a person; the ID is
        // for the audit trail, not for greeting whoever is signed in.
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
            >
              {initialsOf(session.displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {session.displayName}
              </p>
              <p className="truncate text-[11px] text-neutral-500">
                {ROLE_LABELS[session.role]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {session.employeeId}
            </span>
            {session.isSupervisor ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
                Approver
              </span>
            ) : null}
          </div>

          <SignOutButton />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
