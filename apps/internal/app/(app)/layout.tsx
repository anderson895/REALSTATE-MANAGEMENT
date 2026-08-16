import { headers } from 'next/headers';
import Image from 'next/image';
import { AppShell } from '@sfsr/ui';
import { ROLE_LABELS, isInternalRole } from '@sfsr/domain';
import { requireEmployee, toActor } from '@/lib/session';
import { departmentFor, navigationFor } from '@/lib/navigation';
import { countWaitingFor, queueHrefFor } from '@/lib/notifications';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';

/**
 * The application shell, drawn from INTERNAL.xls sheet `USER INTERFACE`.
 *
 * ── One shell, every department ───────────────────────────────────────────
 *
 * The sheet draws five dashboards — Documentation staff and supervisor,
 * Billing, Account Receivables, Sales Agent — and the sidebar is the SAME in
 * all of them. Only the menu items change. So there is one skin here, not five,
 * and the menu is not written per role either: `navigationFor(role)` filters
 * the route list against the RBAC matrix, so a role's menu is whatever its
 * grants say and the two cannot drift apart.
 *
 * The IT Administrator used to hold every module and see every item, which made
 * that account able to stand in for any department during a demo. note.txt
 * ended that — "accessible lang sa maintenance system only, accessible add
 * users only" — so `admin` now sees four links: the dashboard, the audit trail,
 * Users & Roles, and Maintenance in `next dev`. Use the departmental logins to
 * walk through the business screens: jflores (Documentation), cfernandez
 * (Billing), jramos (Sales).
 */

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

  // COST: 1 count() aggregation, or 0 for a role with no queue of its own.
  const notifications = await countWaitingFor(session.role);

  return (
    <AppShell
      variant="navy"
      brand="St. Francis Square"
      subtitle="Realty Corporation"
      logo={
        <Image
          src="/logo.png"
          alt=""
          width={71}
          height={128}
          priority
          className="h-8 w-auto shrink-0 object-contain"
        />
      }
      // The actor, not just the role: the walk-in link is hidden from the
      // Documentation Supervisor, and rank is not part of the RBAC matrix.
      sections={navigationFor(toActor(session))}
      currentPath={currentPath}
      // Only the group holding the current page starts open. Kept after IT was
      // stripped back to four links, because it is the busier desks the setting
      // is for — Documentation spans three groups, and Account Receivables
      // opens with Overview, Processing, Finance and Administration at once.
      collapsibleSections
      topbar={
        <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold uppercase tracking-tight text-navy-800">
              Internal Management System
            </p>
            {/* The department, not the job title — it is what distinguishes
                one of these five near-identical dashboards from another. */}
            <p className="truncate text-xs text-navy-500">{departmentFor(session.role)}</p>
          </div>

          {/*
           * Just the bell and the account, in that order.
           *
           * The sheet also puts a clock and a Logout button along here. Neither
           * survived contact: the clock told staff the time on a machine that
           * already shows it in the corner of the screen, and Logout duplicated
           * the Sign out already sitting in the account menu a few pixels away.
           * Two controls that do the same thing means one of them goes unused.
           */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <NotificationBell count={notifications} href={queueHrefFor(session.role)} />

            <UserMenu
              name={session.displayName}
              role={ROLE_LABELS[session.role]}
              initials={initialsOf(session.displayName)}
              employeeId={session.employeeId}
              isSupervisor={session.isSupervisor}
            />
          </div>
        </div>
      }
      footer={
        // The sheet closes the sidebar with this badge on the Documentation
        // dashboards — the same three words the login screen leads with, which
        // is what ties the door to the rooms behind it.
        <div className="rounded-lg border border-gold-600/40 px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-300">
            Secure · Efficient · Integrated
          </p>
          <p className="mt-0.5 text-[10px] text-white/70">Real Estate Management</p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
