import Link from 'next/link';
import { Search, ShieldCheck } from 'lucide-react';
import { INTERNAL_ROLES, ROLE_LABELS, isInternalRole } from '@sfsr/domain';
import {
  getAdminFirestore,
  listEmployees,
  resolveEmployeeNames,
  type EmployeeRow,
} from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { requireModule } from '@/lib/session';
import { formatDate } from '@/lib/reservations';
import {
  EMPLOYEE_PAGE_SIZE,
  matchesEmployeeSearch,
  pageParam,
  paginate,
  type Paged,
} from '@/lib/employees';
import { AddEmployeeDialog } from './add-employee-dialog';
import { EditEmployeeDialog } from './edit-employee-dialog';
import { StatusToggle } from './status-toggle';

/**
 * Users & Roles — the other half of what note.txt leaves IT.
 *
 * "accessible lang sa maintenance system only, accisible add users only." The
 * maintenance half lives at /admin/maintenance and 404s outside `next dev`.
 * This half has to work in a production build, which is why managing employees
 * belongs here and not on that page.
 *
 * ── Add, edit, deactivate — and what makes that defensible ────────────────
 *
 * This screen shipped first as add-only, reading "add users ONLY" literally and
 * arguing that an administrator who can re-role an account can hand themselves
 * Billing's payment verification. The client then asked for edit and deactivate
 * outright, so they are here.
 *
 * The segregation-of-duties concern did not go away; it changed shape. What
 * answers it now is that a role change is the most heavily recorded event in
 * the system — `employee.updated` carries BEFORE and AFTER for every field that
 * moved, into a log that grants no role update or delete, this one included
 * (§3.6). And two floors are held in the actions regardless of who is asking:
 * nobody may change their own role, and the last active IT Administrator may
 * not be demoted or switched off. USER_MANAGEMENT belongs to that role alone,
 * so an estate with none is one where no account can ever be created again.
 *
 * ── Why Marketing has no seeded account ───────────────────────────────────
 *
 * RBAC.xls has a MARKETING row in USER ROLE ACCESS and no MARKETING personnel
 * sheet — the Advertisement module belongs to a role with zero seedable
 * accounts (Development Plan.md §12, finding 12). `employees.json` is generated
 * from those sheets, so a row typed into it by hand disappears on the next
 * `npm run seed:extract`. The first Marketing Staff is created HERE, by the
 * role the client named, and lands in Firestore looking exactly like one the
 * workbook produced.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireModule('USER_MANAGEMENT');
  const { q = '', page: rawPage } = await searchParams;
  const term = q.trim();

  // COST: 1 query over ~30 documents, plus one getAll for the names behind
  // `createdBy` — which is empty on a freshly seeded database. Searching and
  // paging happen in memory over that one result, so page 3 of a filtered
  // search costs exactly the same as page 1 of everything.
  const db = getAdminFirestore();
  const all = await listEmployees(db);
  const matched = all.filter((employee) => matchesEmployeeSearch(employee, term));
  const paged = paginate(matched, pageParam(rawPage), EMPLOYEE_PAGE_SIZE);

  const creators = await resolveEmployeeNames(
    db,
    paged.rows.map((e) => e.createdBy),
  );

  const roleless = all.filter((e) => !isInternalRole(e.role));
  const missingRoles = INTERNAL_ROLES.filter(
    (role) => !all.some((e) => e.role === role && e.status === 'Active'),
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-navy-700"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-navy-800">Users &amp; Roles</h1>
        </div>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Internal accounts, {session.displayName.split(' ')[0]}. Adding one creates the Firebase
          Auth user, its role claims, the employee record and the username index in a single step —
          the same four records the seed writes.
        </p>
      </header>

      {/*
       * Named before the list, not after it.
       *
       * A role with no active account is a department that cannot sign in, and
       * MARKETING is in that state on every freshly seeded database. Stating it
       * above the roster turns "add a user" into "add the user that is missing".
       */}
      {missingRoles.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">
            {missingRoles.length === 1 ? 'One role has' : `${missingRoles.length} roles have`} no
            active account
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90">
            {missingRoles.map((role) => ROLE_LABELS[role]).join(', ')}. Nobody can sign in to the
            modules {missingRoles.length === 1 ? 'that role owns' : 'those roles own'} until an
            account exists. RBAC.xls carries no personnel sheet for Marketing, so that one has
            always had to be created here.
          </p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Internal Accounts
          </h2>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
            {/*
             * A GET form, so the term lands in the URL and the results are a
             * server render — no client state, works with JavaScript off, and a
             * search can be reloaded or sent to someone. `page` is deliberately
             * not carried through: a new search is a different question from
             * "page 3 of the old one", and keeping it strands people on an
             * empty page 3 of two results.
             */}
            <form action="/admin/users" method="get" className="min-w-0 flex-1 sm:max-w-xs">
              <label htmlFor="employee-search" className="sr-only">
                Search accounts
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                  strokeWidth={2}
                />
                <input
                  id="employee-search"
                  name="q"
                  type="search"
                  defaultValue={term}
                  placeholder="Name, username, role, department..."
                  className="w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20"
                />
              </div>
            </form>

            <AddEmployeeDialog />
          </div>
        </header>

        {term ? (
          <p className="border-b border-neutral-200/80 bg-neutral-50/60 px-5 py-2 text-[11px] text-neutral-500">
            {paged.total === 0
              ? `Nothing matches “${term}”.`
              : `${paged.total} ${paged.total === 1 ? 'account matches' : 'accounts match'} “${term}”.`}{' '}
            <Link href="/admin/users" className="font-semibold text-navy-600 hover:underline">
              Clear search
            </Link>
          </p>
        ) : null}

        {paged.total === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-800">
              {term ? 'No matching accounts' : 'No internal accounts'}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
              {term ? (
                'Search looks inside the name, username, employee ID, role, position and department.'
              ) : (
                <>
                  Run <code className="rounded bg-neutral-100 px-1">npm run seed:load</code> to
                  create the accounts in RBAC.xls, or add one above.
                </>
              )}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {paged.rows.map((employee) => (
              <Row
                key={employee.id}
                employee={employee}
                creators={creators}
                isSelf={employee.id === session.employeeId}
              />
            ))}
          </ul>
        )}

        {paged.total > 0 ? <Pager paged={paged} term={term} /> : null}
      </section>

      {roleless.length > 0 ? (
        <p className="mt-6 rounded-md bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-800">
          {roleless.length} account{roleless.length === 1 ? '' : 's'} carr
          {roleless.length === 1 ? 'ies' : 'y'} a role the RBAC matrix does not recognise (
          {roleless.map((e) => e.id).join(', ')}). Those accounts fail at sign-in rather than
          falling back to reduced access. Edit one to give it a valid role, or re-run{' '}
          <code>npm run seed:load</code>.
        </p>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        Role, rank and department are carried in the account&rsquo;s auth claims, so changing any of
        them signs that employee out and the new access applies from their next sign-in. Every
        change is written to the audit trail with its previous value.
      </p>
    </div>
  );
}

/**
 * "Showing 1 to 10 of 29 accounts", with the page numbers beside it.
 *
 * Plain links, not buttons: a page is a place, so it belongs in the URL where
 * it can be reloaded, bookmarked and sent to someone. It also means the pager
 * costs no JavaScript.
 *
 * The search term IS carried across pages, unlike the queue pager's client
 * selection — page 2 of a search is still that search, and dropping it would
 * throw the person back into the full roster half way through reading a
 * filtered one.
 */
function Pager({ paged, term }: { paged: Paged<EmployeeRow>; term: string }) {
  const search = (page: number) =>
    new URLSearchParams({ ...(term ? { q: term } : {}), page: String(page) }).toString();

  // A window around the current page: a hundred numbered links is not a pager.
  const from = Math.max(1, Math.min(paged.page - 2, paged.pages - 4));
  const window = Array.from({ length: Math.min(5, paged.pages) }, (_, i) => from + i).filter(
    (n) => n <= paged.pages,
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/80 px-5 py-3">
      <p className="text-[11px] text-neutral-500">
        Showing {paged.first} to {paged.last} of {paged.total}{' '}
        {paged.total === 1 ? 'account' : 'accounts'}
      </p>

      {paged.pages > 1 ? (
        <nav aria-label="Account pages" className="flex items-center gap-1">
          <PageLink search={search(paged.page - 1)} disabled={paged.page <= 1} label="Previous page">
            ‹
          </PageLink>
          {window.map((n) => (
            <PageLink key={n} search={search(n)} current={n === paged.page} label={`Page ${n}`}>
              {n}
            </PageLink>
          ))}
          <PageLink
            search={search(paged.page + 1)}
            disabled={paged.page >= paged.pages}
            label="Next page"
          >
            ›
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  search,
  children,
  current,
  disabled,
  label,
}: {
  /** Query string only — the pathname is fixed, and typed routes prefer it split. */
  search: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const styles = cn(
    'flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors',
    current
      ? 'bg-navy-800 text-white'
      : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-100',
  );

  if (disabled) {
    return (
      <span aria-hidden="true" className={cn(styles, 'cursor-not-allowed opacity-40')}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={{ pathname: '/admin/users', search }}
      scroll={false}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={styles}
    >
      {children}
    </Link>
  );
}

function Row({
  employee,
  creators,
  isSelf,
}: {
  employee: EmployeeRow;
  /** Employee id -> full name, resolved once for the page. */
  creators: Map<string, string>;
  isSelf: boolean;
}) {
  const roleLabel = isInternalRole(employee.role)
    ? ROLE_LABELS[employee.role]
    : `${employee.role || 'no role'} — unrecognised`;
  const inactive = employee.status !== 'Active';

  return (
    <li className={cn('px-5 py-3.5', inactive && 'bg-neutral-50/60')}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className="tabular w-16 shrink-0 text-xs font-semibold text-navy-700">
          {employee.id}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-medium',
              inactive ? 'text-neutral-400' : 'text-neutral-800',
            )}
          >
            {employee.fullName}
            {isSelf ? (
              <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-semibold text-navy-700">
                You
              </span>
            ) : null}
            {employee.isSupervisor ? (
              <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-900">
                Supervisor
              </span>
            ) : null}
            {inactive ? (
              <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                {employee.status}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {[employee.username, employee.position, employee.department].filter(Boolean).join(' · ')}
          </p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold',
            isInternalRole(employee.role)
              ? 'bg-navy-50 text-navy-700'
              : 'bg-rose-50 text-rose-700',
          )}
        >
          {roleLabel}
        </span>

        <div className="flex shrink-0 items-start gap-1.5">
          <EditEmployeeDialog employee={employee} />
          {/*
           * No deactivate button on your own row.
           *
           * The action refuses it anyway — that is the control — but offering a
           * button whose only outcome is an error message is worse than not
           * offering it. Editing stays available: changing your own name or
           * position is harmless, and it is only the ROLE the action stops.
           */}
          {isSelf ? null : (
            <StatusToggle
              employeeId={employee.id}
              fullName={employee.fullName}
              status={employee.status}
            />
          )}
        </div>
      </div>

      {/*
       * The data trail.
       *
       * "seeded from RBAC.xls" for the twenty-nine, a name for everyone added
       * since. Attributing the seeded rows to whoever ran the seed would claim
       * a decision nobody made — see `createdBy` in employee.queries.ts.
       */}
      <p className="mt-1.5 text-[11px] text-neutral-400">
        {employee.createdBy
          ? `added by ${creators.get(employee.createdBy) ?? employee.createdBy}${
              employee.createdAt ? ` · ${formatDate(employee.createdAt)}` : ''
            }`
          : 'seeded from RBAC.xls'}
      </p>
    </li>
  );
}
