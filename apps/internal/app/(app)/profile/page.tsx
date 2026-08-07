import type { Metadata } from 'next';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS, isInternalRole, modulesFor } from '@sfsr/domain';
import { requireEmployee } from '@/lib/session';
import { departmentFor } from '@/lib/navigation';

export const metadata: Metadata = { title: 'My Profile' };

/**
 * The signed-in employee's own record.
 *
 * ── Why this is NOT behind USER_MANAGEMENT ────────────────────────────────
 *
 * That module governs administering OTHER people — creating accounts, changing
 * roles. Reading your own name and employee ID is not an administrative act,
 * and gating it would mean nine of the ten roles could not see who they are
 * signed in as. `requireEmployee()` is the whole check: everything on this page
 * comes from the caller's own session claims.
 *
 * COST: 0 reads. Every field below is already in the verified session cookie,
 * which is where `proxy.ts` and the Security Rules read the same facts from.
 * Fetching the employee document again would be a round trip to be told what
 * the token already said.
 */
export default async function ProfilePage() {
  const session = await requireEmployee();
  const modules = isInternalRole(session.role) ? modulesFor(session.role) : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">My Profile</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Your account as the system sees it. Details come from the personnel record in RBAC.xls —
          ask IT to change anything that is wrong.
        </p>
      </header>

      <section className="mb-6 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-neutral-200/80 px-5 py-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-800 text-base font-semibold text-white"
          >
            {initialsOf(session.displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-navy-800">{session.displayName}</p>
            <p className="truncate text-sm text-navy-500">
              {isInternalRole(session.role) ? ROLE_LABELS[session.role] : session.role}
            </p>
          </div>
          {session.isSupervisor ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-semibold text-gold-900">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Approver
            </span>
          ) : null}
        </div>

        <dl className="divide-y divide-neutral-100">
          <Row label="Employee ID" value={session.employeeId} />
          <Row label="Username" value={session.username} />
          <Row label="Department" value={session.department} />
          <Row
            label="Desk"
            value={isInternalRole(session.role) ? departmentFor(session.role) : '—'}
          />
          <Row
            label="Approval rights"
            value={
              session.isSupervisor
                ? 'Yes — this account is the final stage of its transactions'
                : 'No — approvals go to your supervisor'
            }
          />
          <Row label="Modules available" value={`${modules.length}`} />
        </dl>
      </section>

      {session.mustChangePassword ? (
        <p className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span>
            Your password is still the one issued at seeding. Ask IT to reset it before this
            system carries live buyer data.
          </span>
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <h2 className="border-b border-neutral-200/80 px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          What this role may reach
        </h2>
        <div className="px-5 py-4">
          {modules.length === 0 ? (
            <p className="text-sm text-neutral-500">No modules are granted to this role.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {modules.map((module) => (
                <li
                  key={module}
                  className="rounded-md bg-navy-50 px-2 py-1 text-[11px] font-medium text-navy-700"
                >
                  {/* The matrix's own identifiers, softened just enough to
                      read. Renaming them here would make this page disagree
                      with the audit trail, which logs the raw module. */}
                  {module.replace(/_/g, ' ').toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">
            Taken from the USER ROLE ACCESS matrix in RBAC.xls. The menu, every page guard and the
            Firestore Security Rules all read this same list.
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-neutral-800">
        {value || '—'}
      </dd>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
