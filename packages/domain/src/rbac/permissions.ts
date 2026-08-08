import {
  MODULES,
  type ClientTier,
  type InternalRole,
  type Module,
  type Permission,
} from './roles';

/** Everything a role may do in a module, in one place. */
type ModuleGrants = Partial<Record<Module, readonly Permission[]>>;

const FULL: readonly Permission[] = ['view', 'create', 'modify', 'delete', 'print', 'send'];
const READ_PRINT: readonly Permission[] = ['view', 'print'];
const READ_ONLY: readonly Permission[] = ['view'];

/**
 * The permission matrix, transcribed line by line from `RBAC.xls` sheet
 * `USER ROLE ACCESS`. Nothing here is inferred or rounded up for convenience —
 * a role gets exactly the modules its row names (§3.4, Least Privilege).
 *
 * `approve` is deliberately absent from every entry. It is granted by the
 * supervisor flag instead, per the sheet's own note: "All Supervisor per
 * personnel is the approver of the transaction, they are the final stage of
 * the transaction."
 */
const MATRIX: Record<InternalRole, ModuleGrants> = {
  /**
   * IT holds the system, NOT the business.
   *
   * ── The third place the sources disagree, and the sharpest ──────────────
   *
   * RBAC.xls says "Full system administration ... Full Access to All Modules",
   * and this used to grant exactly that: every module, every permission.
   *
   * note.txt overrules it, and is emphatic about which ones go —
   *   "alisan ng access si IT administrator sa mga: walkin buyers, input
   *    payment, restrict processing, restrict sales, restrict finance"
   *   "accessible lang sa maintenance system only, accessible add users only"
   *
   * That is the standard segregation-of-duties argument and the client is
   * right to want it: an administrator who can create the accounts AND verify
   * the payments AND approve the reservation can move money through the system
   * alone, and the audit trail would show nothing unusual. Keeping the two
   * apart is the control.
   *
   * So IT keeps only what running the system requires:
   *   USER_MANAGEMENT — "add users only"
   *   AUDIT_TRAIL     — read-only. RBAC.xls already assigns IT "audit trail
   *                     monitoring", and firestore.rules refuses update and
   *                     delete on it to EVERY role including this one.
   *
   * Deliberately NOT granted: DASHBOARD and ANALYTICS. Both report on sales
   * and collections, which is business data. `/` still renders for IT because
   * the dashboard link is `always` in the internal menu — they get the landing
   * page, and the figures on it stay behind the ANALYTICS grant.
   *
   * WATCH OUT: `admin` was the account every internal screen was demoed from.
   * After this it can reach almost none of them, which is the point. Use the
   * departmental logins instead — jflores (Documentation), cfernandez
   * (Billing), jramos (Sales).
   */
  IT_ADMINISTRATOR: {
    USER_MANAGEMENT: FULL,
    AUDIT_TRAIL: READ_PRINT,
  },

  /**
   * The one place the two source documents contradict each other.
   *
   * RBAC.xls, sheet USER ROLE ACCESS row 7: "Sales Agent, Broker & Group Head
   * … view unit inventory and tripping request from client … view & print".
   * Read literally that makes Sales purely passive.
   *
   * INTERNAL.xls, sheet WEB PORTAL TO INTERNAL item 1, gives the same role an
   * action: "ACCEPT/CONFIRM TRIPPING REQUEST (FIRST SALES AGENT TO ACCEPT)",
   * with the approver column marked N/A — nobody signs it off, the first agent
   * to claim it takes it. A role that cannot modify a tripping cannot accept
   * one, so INTERNAL.xls governs and scheduling carries `modify`.
   *
   * NOT `create` and NOT `delete`, deliberately: the buyer raises the request
   * from the Portal, and firestore.rules refuses deletes on trippings
   * outright. Unit inventory stays view & print — nothing in INTERNAL.xls asks
   * Sales to change stock.
   *
   * Mirrored by `allow update` on /trippings in firestore.rules. Change one
   * and the other has to move with it.
   */
  SALES: {
    UNIT_INVENTORY: READ_PRINT,
    SCHEDULING: ['view', 'print', 'modify'],
    /*
     * note.txt: "marerecieved lang ni sales agent kapag verified na lahat sa
     * billing, documentation, Documentation Supervisor."
     *
     * READ_PRINT, and only over reservations that have cleared BOTH desks and
     * been signed. The module grant cannot express that by itself — it works
     * per module, not per row — so the row filter lives in two places that
     * must agree: `SALES_VISIBLE_STATUSES` in the entity, which the Sales
     * screen queries on, and the /reservations read rule in firestore.rules.
     *
     * `create` was here briefly, for walk-ins. The client moved that to
     * Documentation — "documentation ang in charge for walk in application" —
     * which is the safer arrangement anyway: the desk that raises a
     * reservation is then the desk that checks its ID, and Sales keeps no
     * write access to a reservation at any point.
     */
    RESERVATION_VERIFICATION: READ_PRINT,
  },

  /**
   * "In charge in client masterfile (add, delete & update) ... OCR ..."
   *
   * note.txt splits the approver role three ways — "payment = billing, ID =
   * documentation, Final approval = Documentation Supervisor" — and the last
   * of those lands here. APPROVAL_MONITORING is granted so that
   * `can(actor, 'APPROVAL_MONITORING', 'approve')` passes for a Documentation
   * SUPERVISOR; `approve` is gated on the supervisor flag, so ordinary
   * Documentation staff still cannot sign one off.
   *
   * The entity refuses regardless unless BOTH halves are verified — this only
   * decides who is allowed to try.
   */
  DOCUMENTATION: {
    /*
     * Walk-ins land here too — note.txt: "documentation ang in charge for walk
     * in application". No new grant was needed: RESERVATION_VERIFICATION is
     * already FULL for this role, and FULL includes `create`.
     */
    DOCUMENTARY_REQUIREMENTS: FULL,
    OCR_VALIDATION: FULL,
    RESERVATION_VERIFICATION: FULL,
    CLIENT_PROFILE: FULL,
    APPROVAL_MONITORING: FULL,
  },

  // "Monitor Account due for application ... View & Print Report"
  LOAN_OFFICER: {
    CLIENT_PROFILE: READ_PRINT,
    PAYMENT_MONITORING: READ_PRINT,
  },

  /**
   * "Generate SOA, Apply payment ... Create, modify, delete, view, sending"
   *
   * note.txt gives Billing the payment half of the verification — "payment =
   * billing" — which it could not previously reach at all: RESERVATION_
   * VERIFICATION belonged to Documentation alone, so the desk that confirms
   * the fee had no grant over the record it was confirming.
   *
   * `modify`, not FULL. Billing clears a payment on a reservation; it does not
   * create or delete one.
   */
  BILLING: {
    SOA_GENERATION: FULL,
    PAYMENT_TERM_MONITORING: FULL,
    RESERVATION_VERIFICATION: ['view', 'modify', 'print'],
  },

  // "View dashboards, monitor reservations ... and approve reservation
  //  cancellations and other management-level transactions."
  ACCOUNT_RECEIVABLES: {
    DASHBOARD: FULL,
    REPORTS: FULL,
    ANALYTICS: FULL,
    // MONITORING, as the module is named. note.txt moves the signature itself
    // to the Documentation Supervisor, so this is now read-only: Account
    // Receivables watches the approval queue without being able to sign it.
    APPROVAL_MONITORING: READ_PRINT,
    UNIT_INVENTORY: READ_PRINT,
    PAYMENT_MONITORING: READ_PRINT,
    AUDIT_TRAIL: READ_PRINT,
  },

  // "monitor collections, generate financial reports ... view, manage & print"
  ACCOUNTING: {
    PAYMENT: ['view', 'modify', 'print'],
    OFFICIAL_RECEIPT: ['view', 'modify', 'print'],
    FINANCIAL_REPORTS: ['view', 'modify', 'print'],
  },

  // "Record official receipts, acknowledge payments, monitor daily collections"
  CASH_CLERK: {
    PAYMENT_RECORDS: ['view', 'create', 'modify', 'print'],
    OFFICIAL_RECEIPT: ['view', 'create', 'print'],
  },

  /**
   * "Upload announcement, project details"
   *
   * ── Why this role holds UNIT_INVENTORY, which RBAC.xls does not give it ──
   *
   * A client instruction: "dapat nakakapag add din ang marketing ng mga project
   * at unit." The workbook's row is one line long and names announcements and
   * "project details"; adding the projects and the units themselves goes past
   * it, and the reason to allow that is that nobody else can do it either.
   * UNIT_INVENTORY is view-and-print for Sales and Account Receivables, and the
   * only write access anywhere was `isAdmin()` in the Security Rules — an
   * escape hatch, not a screen. New stock had to be seeded from a workbook.
   *
   * NOT `delete`, and that is the whole of the caution here. A unit is
   * referenced by reservations, payments, documents and an audit trail;
   * deleting one would orphan every record that names it, and a unit taken off
   * the market is `On Hold` or `Sold`, never gone. `modify` is granted because
   * a mistyped price has to be fixable by the person who typed it.
   *
   * WATCH OUT: `pricePerSqmCentavos` and `purchasePriceCentavos` are what
   * PricingService quotes a buyer from. This grant puts the price of a
   * ₱6,000,000 unit in Marketing's hands, which is a real widening of who can
   * move money in this system. `unit.created` and `unit.updated` carry the
   * before-and-after into the append-only log for exactly that reason.
   */
  MARKETING: {
    ADVERTISEMENT: ['view', 'create', 'modify', 'delete'],
    UNIT_INVENTORY: ['view', 'create', 'modify', 'print'],
  },

  // "View Client profile"
  LEGAL_COUNSEL: {
    CLIENT_PROFILE: READ_ONLY,
  },
};

/**
 * Client-tier capabilities from the "Client Access" block.
 *
 * Guest: "View all project details, create account."
 * Initial: "request tripping, request sample computation, reserve unit,
 *           upload payment copy & ID"
 * Permanent: "full access (... view profile, documents, balances, summary of
 *             payments etc..)"
 */
export const CLIENT_CAPABILITIES = [
  'browseProjects',
  'createAccount',
  'requestTripping',
  'requestComputation',
  'reserveUnit',
  'uploadPayment',
  'uploadDocuments',
  'viewOwnProfile',
  'viewOwnDocuments',
  'viewOwnSoa',
  'viewOwnPayments',
  'receiveAnnouncements',
] as const;
export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number];

const CLIENT_MATRIX: Record<ClientTier, readonly ClientCapability[]> = {
  GUEST: ['browseProjects', 'createAccount'],
  INITIAL: [
    'browseProjects',
    'requestTripping',
    'requestComputation',
    'reserveUnit',
    'uploadPayment',
    'uploadDocuments',
  ],
  PERMANENT: [...CLIENT_CAPABILITIES],
};

export interface InternalActor {
  readonly role: InternalRole;
  readonly isSupervisor: boolean;
}

/**
 * The single authorisation question for internal users.
 *
 * Called from three layers — `proxy.ts`, the route handler, and (mirrored) the
 * Firestore Security Rules. Hiding a button in the UI is cosmetic and is never
 * counted as a control (§3.3, Defence in Depth).
 */
export function can(actor: InternalActor, module: Module, permission: Permission): boolean {
  /*
   * Approval is a supervisor act regardless of module, per the sheet's note.
   *
   * It also requires a grant the role could ACT on. This used to accept any
   * grant at all — `grantsFor(...).length > 0` — which was harmless while
   * every holder of a module held it fully, and stopped being harmless the
   * moment note.txt moved final approval to the Documentation Supervisor and
   * left Account Receivables watching the same queue read-only. Under the old
   * test, an AR supervisor with view-and-print could still approve, because
   * "has some grant" and "may change something" were being treated as one
   * question.
   *
   * `modify` is that question. A role that cannot modify a record has no
   * business signing it off.
   */
  if (permission === 'approve') {
    return actor.isSupervisor && grantsFor(actor.role, module).includes('modify');
  }
  return grantsFor(actor.role, module).includes(permission);
}

export function canAccessModule(actor: InternalActor, module: Module): boolean {
  return grantsFor(actor.role, module).length > 0;
}

/** Modules this role may reach — drives the sidebar menu. */
export function modulesFor(role: InternalRole): Module[] {
  return MODULES.filter((m) => grantsFor(role, m).length > 0);
}

export function clientCan(tier: ClientTier, capability: ClientCapability): boolean {
  return CLIENT_MATRIX[tier].includes(capability);
}

function grantsFor(role: InternalRole, module: Module): readonly Permission[] {
  return MATRIX[role][module] ?? [];
}
