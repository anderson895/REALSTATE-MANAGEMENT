import {
  INTERNAL_ROLES,
  ROLE_LABELS,
  isInternalRole,
  validateUsername,
  type InternalRole,
} from '@sfsr/domain';

/**
 * User Management — the shape of a new internal account.
 *
 * note.txt leaves the IT Administrator exactly two capabilities, and this is
 * the second of them: "accessible add users only". Everything here exists to
 * make the account this produces indistinguishable from one the seed created,
 * so that a Marketing Staff added through the interface holds the same fields,
 * the same claims and the same login path as the twenty-nine that came out of
 * RBAC.xls.
 *
 * ── Why Marketing is the first account anyone will add here ───────────────
 *
 * RBAC.xls has a MARKETING row in `USER ROLE ACCESS` and no MARKETING personnel
 * sheet — the Advertisement module is owned by a role with zero seedable
 * accounts (Development Plan.md §12, finding 12). The workbook cannot be edited
 * programmatically (ACE.OLEDB refuses CREATE TABLE against legacy .xls, and
 * rewriting it through xlrd/xlwt produces a file the extract can no longer
 * read), and `employees.json` is GENERATED, so a row typed into it by hand
 * disappears on the next `npm run seed:extract`.
 *
 * So the account is created here instead, by the role the client named. It is
 * not a workaround for the missing sheet — it is the mechanism the system was
 * always supposed to have, and the missing sheet is what made it urgent.
 */

/**
 * Rank, separate from role.
 *
 * RBAC.xls carries these in their own `userRole` column — "Staff",
 * "Supervisor" — beside a role that is a different fact entirely. Holding rank
 * inside the role label is what once produced "Documentation Staff ·
 * Supervisor" in the topbar, asserting both ranks in one line (see
 * ROLE_LABELS in packages/domain/src/rbac/roles.ts).
 *
 * One control on the form, driving both fields, so the two cannot disagree.
 */
export const EMPLOYEE_RANKS = ['Staff', 'Supervisor'] as const;
export type EmployeeRank = (typeof EMPLOYEE_RANKS)[number];

/**
 * The department each role sits in, written the way RBAC.xls writes it.
 *
 * NOT `DEPARTMENT_LABELS` from lib/navigation.tsx, although the two look alike.
 * That map produces a topbar subtitle — "Loans Management — Documentation" —
 * whose job is to tell a member of staff which of five near-identical
 * dashboards they are looking at. This map produces the `department` field
 * STORED on the employee record and copied into the auth claims, and the value
 * there has to match what the seed wrote for the same role, or a hand-added
 * Billing Officer files under a department name none of the seeded three share.
 *
 * A default, not a constraint: the field is editable, because the sheet's own
 * values are inconsistent ("Accounting" beside "IT Department") and the org may
 * well call a new desk something this map has never heard of.
 */
export const DEFAULT_DEPARTMENTS: Record<InternalRole, string> = {
  IT_ADMINISTRATOR: 'IT Department',
  SALES: 'Sales Department',
  DOCUMENTATION: 'Loans Management Department',
  LOAN_OFFICER: 'Loans Management Department',
  BILLING: 'Loans Management Department',
  ACCOUNT_RECEIVABLES: 'User Receivables',
  ACCOUNTING: 'Accounting',
  CASH_CLERK: 'Cash Department',
  MARKETING: 'Marketing Department',
  LEGAL_COUNSEL: 'Legal Department',
};

/**
 * A job title, defaulted from role and rank.
 *
 * The seeded values read "Billing Supervisor", "Documentation Staff", "Legal
 * Officer" — role then rank, which is what this composes. Editable, because
 * "Legal Officer" is not "Legal Staff" and no rule generates that.
 */
const POSITION_STEMS: Record<InternalRole, string> = {
  IT_ADMINISTRATOR: 'IT',
  SALES: 'Sales',
  DOCUMENTATION: 'Documentation',
  LOAN_OFFICER: 'Loan',
  BILLING: 'Billing',
  ACCOUNT_RECEIVABLES: 'Receivables',
  ACCOUNTING: 'Accounting',
  CASH_CLERK: 'Cash',
  MARKETING: 'Marketing',
  LEGAL_COUNSEL: 'Legal',
};

export function defaultPositionFor(role: InternalRole, rank: EmployeeRank): string {
  return `${POSITION_STEMS[role]} ${rank}`;
}

/** Role options for the form, labelled the way the rest of the system labels them. */
export const ROLE_OPTIONS = INTERNAL_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export interface NewEmployeeInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly rank: string;
  readonly department: string;
  readonly position: string;
  readonly username: string;
}

export function isEmployeeRank(value: unknown): value is EmployeeRank {
  return typeof value === 'string' && (EMPLOYEE_RANKS as readonly string[]).includes(value);
}

/**
 * Everything wrong with the form, in one pass.
 *
 * Keyed by field so the form can put each message where it belongs, rather than
 * stopping at the first problem and making the administrator discover the rest
 * one submission at a time — the same contract as `validateWalkInBuyer`.
 *
 * Uniqueness is NOT checked here. It is not a property of the input; it is a
 * property of the database at the moment of writing, and the action checks it
 * there (twice: once for a readable message, once as a `create` that fails if
 * the index moved underneath it).
 */
export function validateNewEmployee(input: NewEmployeeInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.firstName.trim()) errors.firstName = 'First name is required.';
  if (!input.lastName.trim()) errors.lastName = 'Last name is required.';

  if (!(INTERNAL_ROLES as readonly string[]).includes(input.role)) {
    errors.role = 'Choose a role.';
  }
  if (!isEmployeeRank(input.rank)) {
    errors.rank = 'Choose a rank.';
  }

  if (!input.department.trim()) errors.department = 'Department is required.';
  if (!input.position.trim()) errors.position = 'Position is required.';

  const usernameProblems = validateUsername(input.username);
  if (usernameProblems.length > 0) errors.username = usernameProblems[0]!.message;

  return errors;
}

/** "Juan" + "Dela Cruz" -> "Juan Dela Cruz", collapsing stray whitespace. */
export function fullNameOf(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

// ── Editing an existing account ──────────────────────────────────────────────

export const EMPLOYEE_STATUSES = ['Active', 'Inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export function isEmployeeStatus(value: unknown): value is EmployeeStatus {
  return typeof value === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(value);
}

/**
 * What an edit may change, and what it deliberately may not.
 *
 * `username` is absent. It is the key into the `usernames` index, it is what
 * the person types at the login screen, and it is what half the seeded accounts
 * are recognised by — renaming it means moving an index entry, invalidating a
 * live session, and leaving every audit entry written under the old name
 * pointing at a name that no longer exists. Correcting a typo is not worth
 * that; a wrongly-named account is deactivated and reopened.
 *
 * `status` is absent too, and has its own action — see `employeeStatusChanged`
 * in the domain events for why it is not a field like the others.
 */
export interface EmployeeUpdateInput {
  readonly fullName: string;
  readonly role: string;
  readonly rank: string;
  readonly department: string;
  readonly position: string;
}

export function validateEmployeeUpdate(input: EmployeeUpdateInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.fullName.trim()) errors.fullName = 'Full name is required.';
  if (!(INTERNAL_ROLES as readonly string[]).includes(input.role)) errors.role = 'Choose a role.';
  if (!isEmployeeRank(input.rank)) errors.rank = 'Choose a rank.';
  if (!input.department.trim()) errors.department = 'Department is required.';
  if (!input.position.trim()) errors.position = 'Position is required.';

  return errors;
}

/**
 * What actually moved, as before-and-after pairs.
 *
 * Returns an EMPTY object when nothing changed, which the action treats as a
 * no-op rather than writing a document and an audit entry saying that nothing
 * happened. Opening a form, looking at it and closing it is not an event.
 */
export function diffEmployee(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changes[key] = { from: before[key] ?? null, to: value };
  }
  return changes;
}

// ── The roster: searching and paging it ──────────────────────────────────────

/**
 * Ten rows.
 *
 * The roster is 29 people today. Ten is small enough that a page fits on a
 * laptop without scrolling past the pager, and large enough that a department
 * of three is never split across two pages by itself.
 */
export const EMPLOYEE_PAGE_SIZE = 10;

/**
 * The fields the roster search looks at.
 *
 * A structural subset of `EmployeeRow` rather than an import of it, so this
 * module stays free of `@sfsr/infrastructure` — it is also imported by the
 * add and edit forms, which are Client Components, and the infrastructure
 * entry point carries a `server-only` guard that would turn that into a build
 * error.
 */
export interface SearchableEmployee {
  readonly id: string;
  readonly fullName: string;
  readonly username: string;
  readonly department: string;
  readonly position: string;
  readonly role: string;
}

/**
 * Substring search across the whole row, IN MEMORY.
 *
 * ── Why not Firestore, like the client masterfile search ─────────────────
 *
 * `searchClients` runs a PREFIX query, and the Documentation screen has to tell
 * the user so: "Search matches the START of a surname, username or email —
 * Firestore cannot look inside a word." That limitation is forced by the
 * collection being unbounded; you cannot read every buyer to filter them.
 *
 * The roster is different in kind. It is twenty-nine documents, already fetched
 * in ONE query to render the list, and capped at 200. Filtering the array we
 * are already holding costs nothing, adds no index, and gives real substring
 * matching — typing "santos" finds Mark Santos and Alyssa Santos, and typing
 * "market" finds the Marketing desk. A prefix query would find neither.
 *
 * Words are ANDed and order does not matter, so "santos it" and "it santos"
 * both find the IT Supervisor. Matching the whole phrase would fail on the
 * first, and ORing the words would return half the company.
 */
export function matchesEmployeeSearch(employee: SearchableEmployee, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === '') return true;

  const haystack = [
    employee.id,
    employee.fullName,
    employee.username,
    employee.department,
    employee.position,
    employee.role,
    // The LABEL as well as the key: somebody searching for the Legal desk types
    // "legal counsel", not "LEGAL_COUNSEL".
    isInternalRole(employee.role) ? ROLE_LABELS[employee.role] : '',
  ]
    .join(' ')
    .toLowerCase();

  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export interface Paged<T> {
  readonly rows: readonly T[];
  /** Clamped into range — never the raw query parameter. */
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  /** 1-based, for "Showing 1 to 10 of 29". Both 0 when there is nothing. */
  readonly first: number;
  readonly last: number;
}

/**
 * One page of an array, with the numbers the pager prints.
 *
 * ── Why in memory and not `.offset()` ────────────────────────────────────
 *
 * The document queue pages in Firestore and says why it is uncomfortable about
 * it: "Firestore BILLS for skipped documents, so this is only honest while the
 * queue is small." Here the whole roster is already in hand from the one query
 * that renders the screen, so paging it costs literally nothing — page 3 of a
 * filtered search is the same single read as page 1.
 *
 * `requested` is CLAMPED rather than trusted. `?page=999` and `?page=-4` are
 * both one keystroke away in the address bar, and an out-of-range page renders
 * an empty list under a pager insisting there are twenty-nine accounts.
 */
export function paginate<T>(
  rows: readonly T[],
  requested: number,
  pageSize = EMPLOYEE_PAGE_SIZE,
): Paged<T> {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Number.isFinite(requested) ? Math.trunc(requested) : 1, 1), pages);
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    page,
    pages,
    total,
    first: total === 0 ? 0 : start + 1,
    last: Math.min(start + pageSize, total),
  };
}

/** `?page=` as typed, before clamping. Anything unparseable is page 1. */
export function pageParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 1;
}
