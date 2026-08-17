import { describe, expect, it } from 'vitest';
import {
  can,
  canAccessModule,
  canManageMedia,
  canRemoveInventory,
  canRaiseWalkIn,
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
  /**
   * IT used to hold every module. note.txt takes the business away from it —
   * "restrict processing, restrict sales, restrict finance ... accessible lang
   * sa maintenance system only, accessible add users only" — so this asserts
   * the opposite of what it once did, deliberately.
   *
   * An exhaustive sweep rather than a few spot checks, so a module added later
   * cannot quietly land back in IT's lap.
   */
  it('leaves IT Administrator with only user management and the audit trail', () => {
    const allowed = new Set<string>(['USER_MANAGEMENT', 'AUDIT_TRAIL']);

    // Named `mod`, not `module` — the latter shadows the CommonJS global.
    for (const mod of MODULES) {
      expect(canAccessModule(staff('IT_ADMINISTRATOR'), mod), mod).toBe(allowed.has(mod));
    }
  });

  it('does not let IT Administrator touch payments, sales or approvals', () => {
    const admin = staff('IT_ADMINISTRATOR');
    expect(can(admin, 'PAYMENT', 'modify')).toBe(false);
    expect(can(admin, 'PAYMENT_RECORDS', 'create')).toBe(false);
    expect(can(admin, 'RESERVATION_VERIFICATION', 'modify')).toBe(false);
    expect(can(admin, 'APPROVAL_MONITORING', 'view')).toBe(false);
    expect(can(admin, 'SCHEDULING', 'modify')).toBe(false);
    expect(can(admin, 'CLIENT_PROFILE', 'view')).toBe(false);
  });

  it('keeps the audit trail readable but never writable, even for IT', () => {
    const admin = supervisor('IT_ADMINISTRATOR');
    expect(can(admin, 'AUDIT_TRAIL', 'view')).toBe(true);
    expect(can(admin, 'AUDIT_TRAIL', 'print')).toBe(true);
    // Mirrors firestore.rules, which refuses update and delete on auditLogs to
    // every role: "a log an administrator can rewrite provides no assurance".
    expect(can(admin, 'AUDIT_TRAIL', 'modify')).toBe(false);
    expect(can(admin, 'AUDIT_TRAIL', 'delete')).toBe(false);
  });

  /**
   * note.txt: "approver hati hatiin ang access — payment = billing, ID =
   * documentation, Final approval = Documentation Supervisor (maapprove niya
   * lang final kung approve na ng billing and documentation)."
   *
   * This covers WHO may attempt each step. That both halves must be finished
   * before the signature is a rule of the entity, tested in reservation.test.ts
   * — the two layers guard different things and neither is sufficient alone.
   */
  describe('the three-way approver split', () => {
    it('lets Billing verify a payment on a reservation', () => {
      expect(can(staff('BILLING'), 'RESERVATION_VERIFICATION', 'modify')).toBe(true);
      // The desk clears a payment; it does not open or delete reservations.
      expect(can(staff('BILLING'), 'RESERVATION_VERIFICATION', 'create')).toBe(false);
      expect(can(staff('BILLING'), 'RESERVATION_VERIFICATION', 'delete')).toBe(false);
    });

    it('lets Documentation verify the documentary requirements', () => {
      expect(can(staff('DOCUMENTATION'), 'RESERVATION_VERIFICATION', 'modify')).toBe(true);
    });

    it('gives final approval to a Documentation SUPERVISOR only', () => {
      expect(can(supervisor('DOCUMENTATION'), 'APPROVAL_MONITORING', 'approve')).toBe(true);
      // Same department, no supervisor flag — `can` refuses on the flag alone.
      expect(can(staff('DOCUMENTATION'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    });

    it('leaves Account Receivables monitoring approvals without signing them', () => {
      expect(can(supervisor('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'view')).toBe(true);
      // Was true before note.txt moved the signature to Documentation.
      expect(can(supervisor('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    });

    it('does not let Billing sign off its own verification', () => {
      // The whole point of splitting the approver: the desk that clears the
      // payment must not also be the one that closes the transaction.
      expect(can(supervisor('BILLING'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    });
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

  /**
   * Marketing writes the catalogue, and nobody else does.
   *
   * A client instruction past RBAC.xls: "dapat nakakapag add din ang marketing
   * ng mga project at unit." Until then UNIT_INVENTORY was view-and-print for
   * everyone who held it, and new stock could only arrive through the seed.
   */
  it('lets Marketing add stock, and no other role', () => {
    expect(can(staff('MARKETING'), 'UNIT_INVENTORY', 'create')).toBe(true);
    expect(can(staff('MARKETING'), 'UNIT_INVENTORY', 'modify')).toBe(true);

    const mayAddStock = INTERNAL_ROLES.filter((role) =>
      can(staff(role), 'UNIT_INVENTORY', 'create'),
    );
    expect(mayAddStock).toEqual(['MARKETING']);
  });

  /**
   * A unit is referenced by reservations, payments, documents and an audit
   * trail. Deleting one would orphan every record naming it — and a unit taken
   * off the market is On Hold or Sold, never gone.
   */
  it('does not let Marketing delete a unit, only add and correct one', () => {
    expect(can(staff('MARKETING'), 'UNIT_INVENTORY', 'delete')).toBe(false);
    // The delete it does hold is over its own announcements, not over stock.
    expect(can(staff('MARKETING'), 'ADVERTISEMENT', 'delete')).toBe(true);
  });

  it('leaves Sales and Account Receivables reading inventory, not writing it', () => {
    for (const role of ['SALES', 'ACCOUNT_RECEIVABLES'] as const) {
      expect(can(staff(role), 'UNIT_INVENTORY', 'view')).toBe(true);
      expect(can(staff(role), 'UNIT_INVENTORY', 'print')).toBe(true);
      expect(can(staff(role), 'UNIT_INVENTORY', 'create')).toBe(false);
      expect(can(staff(role), 'UNIT_INVENTORY', 'modify')).toBe(false);
    }
  });
});

describe('can — approval is a supervisor act', () => {
  it('denies approve to staff even inside their own module', () => {
    expect(can(staff('DOCUMENTATION'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    expect(can(supervisor('DOCUMENTATION'), 'APPROVAL_MONITORING', 'approve')).toBe(true);
  });

  /**
   * Being a supervisor of a module you can only READ is not enough.
   *
   * `can` used to ask only whether the role held the module at all, so an
   * Account Receivables supervisor could approve on a view-and-print grant.
   * note.txt moved the signature to Documentation and left AR monitoring, and
   * that is the case which exposed it.
   */
  it('needs a grant the supervisor could act on, not merely look at', () => {
    expect(can(supervisor('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'view')).toBe(true);
    expect(can(supervisor('ACCOUNT_RECEIVABLES'), 'APPROVAL_MONITORING', 'approve')).toBe(false);

    // Read-only elsewhere, same rule.
    expect(can(supervisor('LOAN_OFFICER'), 'PAYMENT_MONITORING', 'view')).toBe(true);
    expect(can(supervisor('LOAN_OFFICER'), 'PAYMENT_MONITORING', 'approve')).toBe(false);
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
      // IT_ADMINISTRATOR used to be skipped here — "has everything by design".
      // note.txt took the business modules away from it, so it is now the role
      // with the MOST denials and belongs in this sweep more than any other.
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

/**
 * note.txt: "Add walking reservation on internal same process sa web portal",
 * with walk-in buyers taken away from IT in the same list.
 */
describe('walk-in reservations', () => {
  it('lets Documentation raise one', () => {
    // "documentation ang in charge for walk in application" — it was briefly
    // Sales, and moving it here means the desk that raises a reservation is
    // the desk that checks the ID attached to it.
    expect(can(staff('DOCUMENTATION'), 'RESERVATION_VERIFICATION', 'create')).toBe(true);
  });

  it('does not let Sales raise or change one at all', () => {
    expect(can(staff('SALES'), 'RESERVATION_VERIFICATION', 'create')).toBe(false);
    expect(can(staff('SALES'), 'RESERVATION_VERIFICATION', 'modify')).toBe(false);
    expect(can(supervisor('SALES'), 'APPROVAL_MONITORING', 'approve')).toBe(false);
    // Reading approved sales is all they keep.
    expect(can(staff('SALES'), 'RESERVATION_VERIFICATION', 'view')).toBe(true);
  });

  it('keeps it away from IT entirely', () => {
    expect(can(staff('IT_ADMINISTRATOR'), 'RESERVATION_VERIFICATION', 'create')).toBe(false);
  });

  it('does not let Billing raise one either', () => {
    // Billing clears payments; raising the reservation it will then clear
    // would put both halves in one desk.
    expect(can(staff('BILLING'), 'RESERVATION_VERIFICATION', 'create')).toBe(false);
  });
});

/**
 * note.txt: "Kay Document Supervisor hindi dapat siya nakakapag Walkin, kay
 * Documentation Staff lang talaga ang Walking process."
 *
 * The rank, not the role, is what decides — which is why this needs its own
 * predicate and its own tests. `can(..., 'create')` cannot see the difference.
 */
describe('canRaiseWalkIn — the counter is Documentation Staff only', () => {
  it('lets Documentation STAFF raise one', () => {
    expect(canRaiseWalkIn(staff('DOCUMENTATION'))).toBe(true);
  });

  it('refuses the Documentation SUPERVISOR', () => {
    // They give the final approval. Raising the reservation they will later
    // sign off puts the first and last signature on one desk.
    expect(canRaiseWalkIn(supervisor('DOCUMENTATION'))).toBe(false);
  });

  it('is stricter than the raw create grant it builds on', () => {
    // The point of the predicate: the matrix says yes to both, because Staff
    // and Supervisor are one role. Only the rank separates them.
    expect(can(supervisor('DOCUMENTATION'), 'RESERVATION_VERIFICATION', 'create')).toBe(true);
    expect(canRaiseWalkIn(supervisor('DOCUMENTATION'))).toBe(false);
  });

  it('still refuses every role that never had the grant', () => {
    for (const role of ['SALES', 'BILLING', 'IT_ADMINISTRATOR', 'LEGAL_COUNSEL'] as const) {
      expect(canRaiseWalkIn(staff(role))).toBe(false);
      expect(canRaiseWalkIn(supervisor(role))).toBe(false);
    }
  });
});

/**
 * `delete` on UNIT_INVENTORY was withheld deliberately for most of the
 * project, so the grant is pinned here rather than left to be noticed.
 */
describe('canRemoveInventory — taking a mistake back off the market', () => {
  it('lets Marketing remove one', () => {
    expect(canRemoveInventory(staff('MARKETING'))).toBe(true);
  });

  it('grants NOBODY delete on the module, which is the point', () => {
    // A module-level delete would also authorise removing a UNIT, which the
    // matrix comment forbids in as many words. The capability is granted
    // instead, and stays exactly as wide as the need.
    for (const role of INTERNAL_ROLES) {
      expect(can(staff(role), 'UNIT_INVENTORY', 'delete')).toBe(false);
      expect(can(supervisor(role), 'UNIT_INVENTORY', 'delete')).toBe(false);
    }
  });

  it('refuses every role but Marketing', () => {
    for (const role of INTERNAL_ROLES) {
      if (role === 'MARKETING') continue;
      expect(canRemoveInventory(staff(role))).toBe(false);
      expect(canRemoveInventory(supervisor(role))).toBe(false);
    }
  });
});

/**
 * "lagyan din pala ang marketing ng mapag uupdatetan ng mga pictures ng mga
 * projects and unit" — the department that owns how the company presents
 * itself owns its imagery.
 */
describe('canManageMedia — project and unit pictures', () => {
  it('lets Marketing in', () => {
    expect(canManageMedia(staff('MARKETING'))).toBe(true);
    expect(canManageMedia(supervisor('MARKETING'))).toBe(true);
  });

  it('keeps out the roles that only READ inventory', () => {
    // Both hold UNIT_INVENTORY, neither holds modify. They quote buyers from
    // the catalogue; they do not decide what it looks like.
    expect(canManageMedia(staff('SALES'))).toBe(false);
    expect(canManageMedia(staff('ACCOUNT_RECEIVABLES'))).toBe(false);
  });

  it('keeps out IT, who administer the system but do not market it', () => {
    expect(canManageMedia(staff('IT_ADMINISTRATOR'))).toBe(false);
    expect(canManageMedia(supervisor('IT_ADMINISTRATOR'))).toBe(false);
  });

  it('is not satisfied by the modify grant alone', () => {
    // The point of naming the role. Documentation can modify plenty, and none
    // of it is the company's photography.
    for (const role of INTERNAL_ROLES) {
      if (role === 'MARKETING') continue;
      expect(canManageMedia(staff(role))).toBe(false);
    }
  });
});
