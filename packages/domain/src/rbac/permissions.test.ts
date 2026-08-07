import { describe, expect, it } from 'vitest';
import {
  can,
  canAccessModule,
  clientCan,
  modulesFor,
  type InternalActor,
} from './permissions';
import { INTERNAL_ROLES, MODULES, resolveRoleFromSheet, type InternalRole } from './roles';

const staff = (role: InternalRole): InternalActor => ({ role, isSupervisor: false });
const supervisor = (role: InternalRole): InternalActor => ({ role, isSupervisor: true });

describe('resolveRoleFromSheet — disambiguating Loans Management', () => {
  it('separates the three roles that share one department', () => {
    // All nine of these employees have department "Loans Management Department".
    expect(resolveRoleFromSheet('DOCUMENTATION')).toBe('DOCUMENTATION');
    expect(resolveRoleFromSheet('BILLING')).toBe('BILLING');
    expect(resolveRoleFromSheet('LOANS')).toBe('LOAN_OFFICER');
  });

  it('maps the remaining sheets', () => {
    expect(resolveRoleFromSheet('IT')).toBe('IT_ADMINISTRATOR');
    expect(resolveRoleFromSheet('RECEIVABLES')).toBe('ACCOUNT_RECEIVABLES');
    expect(resolveRoleFromSheet('CASH')).toBe('CASH_CLERK');
    expect(resolveRoleFromSheet('ACCOUNTING')).toBe('ACCOUNTING');
    expect(resolveRoleFromSheet('LEGAL')).toBe('LEGAL_COUNSEL');
  });

  it('returns null for an unknown sheet rather than guessing', () => {
    expect(resolveRoleFromSheet('PAYROLL')).toBeNull();
  });
});

describe('can — grants transcribed from USER ROLE ACCESS', () => {
  it('gives IT Administrator every module', () => {
    // Named `mod`, not `module` — the latter shadows the CommonJS global.
    for (const mod of MODULES) {
      expect(canAccessModule(staff('IT_ADMINISTRATOR'), mod), mod).toBe(true);
    }
  });

  it('lets Sales act on scheduling but only look at inventory', () => {
    expect(can(staff('SALES'), 'UNIT_INVENTORY', 'view')).toBe(true);
    expect(can(staff('SALES'), 'UNIT_INVENTORY', 'print')).toBe(true);
    expect(can(staff('SALES'), 'UNIT_INVENTORY', 'modify')).toBe(false);

    expect(can(staff('SALES'), 'SCHEDULING', 'view')).toBe(true);
    expect(can(staff('SALES'), 'SCHEDULING', 'print')).toBe(true);
    // INTERNAL.xls: "ACCEPT/CONFIRM TRIPPING REQUEST (FIRST SALES AGENT TO
    // ACCEPT)". Accepting is a write, so this has to be true even though the
    // RBAC.xls row says "view & print".
    expect(can(staff('SALES'), 'SCHEDULING', 'modify')).toBe(true);
  });

  it('does not let Sales raise or destroy a tripping request', () => {
    // The buyer creates it from the Portal and firestore.rules refuses every
    // delete. Accepting is the only thing Sales does to the record.
    expect(can(staff('SALES'), 'SCHEDULING', 'create')).toBe(false);
    expect(can(staff('SALES'), 'SCHEDULING', 'delete')).toBe(false);
  });

  it('gives Legal Counsel read-only on client profiles and nothing else', () => {
    expect(can(staff('LEGAL_COUNSEL'), 'CLIENT_PROFILE', 'view')).toBe(true);
    expect(can(staff('LEGAL_COUNSEL'), 'CLIENT_PROFILE', 'modify')).toBe(false);
    expect(can(staff('LEGAL_COUNSEL'), 'CLIENT_PROFILE', 'delete')).toBe(false);
    expect(modulesFor('LEGAL_COUNSEL')).toEqual(['CLIENT_PROFILE']);
  });

  it('lets Documentation manage the client masterfile and OCR validation', () => {
    for (const p of ['view', 'create', 'modify', 'delete'] as const) {
      expect(can(staff('DOCUMENTATION'), 'CLIENT_PROFILE', p), p).toBe(true);
      expect(can(staff('DOCUMENTATION'), 'OCR_VALIDATION', p), p).toBe(true);
    }
  });

  it('lets Billing send an SOA but not touch unit inventory', () => {
    expect(can(staff('BILLING'), 'SOA_GENERATION', 'send')).toBe(true);
    expect(canAccessModule(staff('BILLING'), 'UNIT_INVENTORY')).toBe(false);
  });

  it('keeps the Loan Officer read-only — "View & Print Report"', () => {
    expect(can(staff('LOAN_OFFICER'), 'PAYMENT_MONITORING', 'view')).toBe(true);
    expect(can(staff('LOAN_OFFICER'), 'PAYMENT_MONITORING', 'print')).toBe(true);
    expect(can(staff('LOAN_OFFICER'), 'PAYMENT_MONITORING', 'modify')).toBe(false);
    expect(can(staff('LOAN_OFFICER'), 'CLIENT_PROFILE', 'delete')).toBe(false);
  });
});

describe('can — approval is a supervisor act', () => {
  it('denies approve to staff even inside their own module', () => {
    expect(can(staff('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    expect(can(supervisor('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'approve')).toBe(true);
  });

  it('does not let a supervisor approve outside their modules', () => {
    // A Cash supervisor is still a Cash supervisor.
    expect(can(supervisor('CASH_CLERK'), 'SOA_GENERATION', 'approve')).toBe(false);
    expect(can(supervisor('CASH_CLERK'), 'PAYMENT_RECORDS', 'approve')).toBe(true);
  });
});

describe('can — denial is the default', () => {
  it('denies every module the matrix does not name, for every role', () => {
    for (const role of INTERNAL_ROLES) {
      if (role === 'IT_ADMINISTRATOR') continue; // has everything by design
      const granted = new Set(modulesFor(role));
      const denied = MODULES.filter((m) => !granted.has(m));

      expect(denied.length, `${role} should not reach every module`).toBeGreaterThan(0);
      for (const mod of denied) {
        expect(can(staff(role), mod, 'view'), `${role} -> ${mod}`).toBe(false);
        expect(can(supervisor(role), mod, 'approve'), `${role} -> ${mod}`).toBe(false);
      }
    }
  });

  it('never grants delete outside the roles whose row says so', () => {
    const mayDelete = INTERNAL_ROLES.filter((role) =>
      MODULES.some((m) => can(staff(role), m, 'delete')),
    );
    expect(mayDelete.sort()).toEqual(
      ['BILLING', 'DOCUMENTATION', 'IT_ADMINISTRATOR', 'ACCOUNT_RECEIVABLES', 'MARKETING'].sort(),
    );
  });
});

describe('clientCan — the three account tiers', () => {
  it('lets a guest browse and register, nothing more', () => {
    expect(clientCan('GUEST', 'browseProjects')).toBe(true);
    expect(clientCan('GUEST', 'createAccount')).toBe(true);
    expect(clientCan('GUEST', 'reserveUnit')).toBe(false);
    expect(clientCan('GUEST', 'viewOwnSoa')).toBe(false);
  });

  it('lets an initial account reserve but not view an SOA', () => {
    expect(clientCan('INITIAL', 'reserveUnit')).toBe(true);
    expect(clientCan('INITIAL', 'requestTripping')).toBe(true);
    expect(clientCan('INITIAL', 'uploadPayment')).toBe(true);
    // SOA arrives only with the permanent account, per RESERVATION.doc.
    expect(clientCan('INITIAL', 'viewOwnSoa')).toBe(false);
    expect(clientCan('INITIAL', 'viewOwnPayments')).toBe(false);
  });

  it('gives a permanent client everything', () => {
    expect(clientCan('PERMANENT', 'viewOwnSoa')).toBe(true);
    expect(clientCan('PERMANENT', 'viewOwnPayments')).toBe(true);
    expect(clientCan('PERMANENT', 'reserveUnit')).toBe(true);
    expect(clientCan('PERMANENT', 'receiveAnnouncements')).toBe(true);
  });
});
