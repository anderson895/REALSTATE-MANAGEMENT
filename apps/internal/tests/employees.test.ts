import { describe, expect, it } from 'vitest';
import { INTERNAL_ROLES } from '@sfsr/domain';
import {
  DEFAULT_DEPARTMENTS,
  EMPLOYEE_RANKS,
  ROLE_OPTIONS,
  defaultPositionFor,
  diffEmployee,
  fullNameOf,
  isEmployeeRank,
  isEmployeeStatus,
  matchesEmployeeSearch,
  pageParam,
  paginate,
  validateEmployeeUpdate,
  validateNewEmployee,
  type EmployeeUpdateInput,
  type NewEmployeeInput,
  type SearchableEmployee,
} from '../lib/employees';

const employee = (over: Partial<NewEmployeeInput> = {}): NewEmployeeInput => ({
  firstName: 'Bea',
  lastName: 'Villanueva',
  role: 'MARKETING',
  rank: 'Staff',
  department: 'Marketing Department',
  position: 'Marketing Staff',
  username: 'bvillanueva',
  ...over,
});

describe('validateNewEmployee', () => {
  it('accepts a complete Marketing Staff — the account this screen exists to create', () => {
    expect(validateNewEmployee(employee())).toEqual({});
  });

  it('reports every problem at once rather than the first', () => {
    const errors = validateNewEmployee(
      employee({ firstName: '  ', lastName: '', department: '', username: 'ab' }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'department',
      'firstName',
      'lastName',
      'username',
    ]);
  });

  it('refuses a role the RBAC matrix does not define', () => {
    // Otherwise the account is created, signs in, and throws in `toActor` —
    // which is where an unrecognised role surfaces today.
    expect(validateNewEmployee(employee({ role: 'SUPERADMIN' })).role).toBeDefined();
    expect(validateNewEmployee(employee({ role: '' })).role).toBeDefined();
  });

  it('refuses a rank outside Staff and Supervisor', () => {
    // The rank decides `isSupervisor`, which decides who may approve. Anything
    // unrecognised must not quietly resolve to "not a supervisor".
    expect(validateNewEmployee(employee({ rank: 'Manager' })).rank).toBeDefined();
  });

  it('holds a username to the same policy the Portal holds a buyer to', () => {
    expect(validateNewEmployee(employee({ username: 'ab' })).username).toBeDefined();
    expect(validateNewEmployee(employee({ username: 'has space' })).username).toBeDefined();
    expect(validateNewEmployee(employee({ username: 'b-villanueva' })).username).toBeDefined();
    expect(validateNewEmployee(employee({ username: 'bvilla2' }))).toEqual({});
  });

  it('does not accept whitespace as a department or position', () => {
    const errors = validateNewEmployee(employee({ department: '   ', position: '\t' }));
    expect(errors.department).toBeDefined();
    expect(errors.position).toBeDefined();
  });
});

describe('role defaults', () => {
  it('has a department for every role in the matrix', () => {
    // A role added to INTERNAL_ROLES without a department here would render the
    // form with an empty required field and no explanation.
    for (const role of INTERNAL_ROLES) {
      expect(DEFAULT_DEPARTMENTS[role]?.trim()).toBeTruthy();
    }
  });

  it('has a position for every role and rank combination', () => {
    for (const role of INTERNAL_ROLES) {
      for (const rank of EMPLOYEE_RANKS) {
        expect(defaultPositionFor(role, rank)).toMatch(/\S \S/);
      }
    }
  });

  it('composes position as role then rank, matching the seeded values', () => {
    // RBAC.xls carries "Billing Supervisor" and "Documentation Staff".
    expect(defaultPositionFor('BILLING', 'Supervisor')).toBe('Billing Supervisor');
    expect(defaultPositionFor('DOCUMENTATION', 'Staff')).toBe('Documentation Staff');
    expect(defaultPositionFor('MARKETING', 'Staff')).toBe('Marketing Staff');
  });

  it('offers exactly the roles the matrix defines, and no others', () => {
    expect(ROLE_OPTIONS.map((o) => o.value)).toEqual([...INTERNAL_ROLES]);
    expect(ROLE_OPTIONS.every((o) => o.label.trim().length > 0)).toBe(true);
  });
});

describe('isEmployeeRank', () => {
  it('narrows only the two ranks RBAC.xls carries', () => {
    expect(isEmployeeRank('Staff')).toBe(true);
    expect(isEmployeeRank('Supervisor')).toBe(true);
    expect(isEmployeeRank('supervisor')).toBe(false);
    expect(isEmployeeRank(undefined)).toBe(false);
  });
});

describe('fullNameOf', () => {
  it('joins the two names', () => {
    expect(fullNameOf('Juan', 'Dela Cruz')).toBe('Juan Dela Cruz');
  });

  it('collapses stray whitespace rather than storing it', () => {
    expect(fullNameOf('  Maria  Theresa ', ' Santos ')).toBe('Maria Theresa Santos');
  });
});

// ── Editing ─────────────────────────────────────────────────────────────────

const update = (over: Partial<EmployeeUpdateInput> = {}): EmployeeUpdateInput => ({
  fullName: 'Bea Villanueva',
  role: 'MARKETING',
  rank: 'Staff',
  department: 'Marketing Department',
  position: 'Marketing Staff',
  ...over,
});

describe('validateEmployeeUpdate', () => {
  it('accepts a complete edit', () => {
    expect(validateEmployeeUpdate(update())).toEqual({});
  });

  it('holds role and rank to the same values the add form does', () => {
    expect(validateEmployeeUpdate(update({ role: 'SUPERADMIN' })).role).toBeDefined();
    expect(validateEmployeeUpdate(update({ rank: 'Manager' })).rank).toBeDefined();
  });

  it('refuses a blank name, department or position', () => {
    const errors = validateEmployeeUpdate(
      update({ fullName: ' ', department: '', position: '  ' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['department', 'fullName', 'position']);
  });
});

describe('isEmployeeStatus', () => {
  it('narrows only Active and Inactive', () => {
    expect(isEmployeeStatus('Active')).toBe(true);
    expect(isEmployeeStatus('Inactive')).toBe(true);
    expect(isEmployeeStatus('Disabled')).toBe(false);
    expect(isEmployeeStatus(null)).toBe(false);
  });
});

describe('diffEmployee', () => {
  it('returns nothing when nothing moved', () => {
    // The action treats this as a no-op. Writing a document and an audit entry
    // saying nothing happened makes the log harder to read for no gain.
    const same = { role: 'BILLING', isSupervisor: false };
    expect(diffEmployee(same, { ...same })).toEqual({});
  });

  it('reports only the fields that changed, with both sides', () => {
    const changes = diffEmployee(
      { role: 'DOCUMENTATION', userRole: 'Staff', isSupervisor: false, position: 'Doc Staff' },
      { role: 'DOCUMENTATION', userRole: 'Supervisor', isSupervisor: true, position: 'Doc Staff' },
    );
    expect(Object.keys(changes).sort()).toEqual(['isSupervisor', 'userRole']);
    expect(changes.userRole).toEqual({ from: 'Staff', to: 'Supervisor' });
    expect(changes.isSupervisor).toEqual({ from: false, to: true });
  });

  it('records a previously absent field as null rather than undefined', () => {
    // `undefined` is not a legal Firestore value, and this lands in an audit
    // entry payload — a rejected write would take the whole update with it.
    expect(diffEmployee({}, { department: 'Marketing Department' }).department).toEqual({
      from: null,
      to: 'Marketing Department',
    });
  });
});

// ── The roster: search and paging ───────────────────────────────────────────

const roster: SearchableEmployee[] = [
  {
    id: 'EMP002',
    fullName: 'Mark Santos',
    username: 'msantos',
    department: 'IT Department',
    position: 'IT Supervisor',
    role: 'IT_ADMINISTRATOR',
  },
  {
    id: 'EMP022',
    fullName: 'Alyssa Santos',
    username: 'asantos',
    department: 'Accounting',
    position: 'Accounting Staff',
    role: 'ACCOUNTING',
  },
  {
    id: 'EMP030',
    fullName: 'Bea Villanueva',
    username: 'bvillanueva',
    department: 'Marketing Department',
    position: 'Marketing Staff',
    role: 'MARKETING',
  },
];

describe('matchesEmployeeSearch', () => {
  it('matches everything on an empty term', () => {
    expect(roster.filter((e) => matchesEmployeeSearch(e, '   '))).toHaveLength(3);
  });

  it('matches INSIDE a word, which a Firestore prefix query cannot', () => {
    // The whole reason this filters in memory: "santos" must find both, and
    // "market" must find the Marketing desk.
    expect(roster.filter((e) => matchesEmployeeSearch(e, 'santos'))).toHaveLength(2);
    expect(roster.filter((e) => matchesEmployeeSearch(e, 'market'))).toHaveLength(1);
  });

  it('is case insensitive', () => {
    expect(matchesEmployeeSearch(roster[0]!, 'MARK SANTOS')).toBe(true);
  });

  it('ANDs the words, in any order', () => {
    expect(matchesEmployeeSearch(roster[0]!, 'santos it')).toBe(true);
    expect(matchesEmployeeSearch(roster[0]!, 'it santos')).toBe(true);
    // Alyssa is Accounting, so this must not match her on "santos" alone.
    expect(matchesEmployeeSearch(roster[1]!, 'santos it')).toBe(false);
  });

  it('searches the employee ID and the username', () => {
    expect(matchesEmployeeSearch(roster[2]!, 'emp030')).toBe(true);
    expect(matchesEmployeeSearch(roster[2]!, 'bvilla')).toBe(true);
  });

  it('searches the role LABEL, not only the matrix key', () => {
    // Somebody looking for the Legal desk types "legal counsel", not
    // "LEGAL_COUNSEL".
    expect(matchesEmployeeSearch(roster[0]!, 'IT Administrator')).toBe(true);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i + 1);

  it('slices the requested page and reports the display numbers', () => {
    const first = paginate(rows, 1, 10);
    expect(first.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([first.first, first.last, first.total, first.pages]).toEqual([1, 10, 23, 3]);

    const last = paginate(rows, 3, 10);
    expect(last.rows).toEqual([21, 22, 23]);
    expect([last.first, last.last]).toEqual([21, 23]);
  });

  it('clamps a page number past the end rather than rendering nothing', () => {
    // `?page=999` is one keystroke away in the address bar, and an empty list
    // under a pager insisting there are 23 accounts reads as data loss.
    expect(paginate(rows, 999, 10).page).toBe(3);
    expect(paginate(rows, 999, 10).rows).toEqual([21, 22, 23]);
  });

  it('clamps zero, negatives and nonsense to the first page', () => {
    for (const requested of [0, -4, Number.NaN]) {
      expect(paginate(rows, requested, 10).page).toBe(1);
    }
  });

  it('survives an empty list without claiming page 0 of 0', () => {
    const empty = paginate([], 1, 10);
    expect([empty.page, empty.pages, empty.total, empty.first, empty.last]).toEqual([1, 1, 0, 0, 0]);
  });
});

describe('pageParam', () => {
  it('reads a page number out of the query string', () => {
    expect(pageParam('3')).toBe(3);
  });

  it('falls back to page 1 for anything unparseable', () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam('')).toBe(1);
    expect(pageParam('two')).toBe(1);
  });
});
