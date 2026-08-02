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
  // "Full system administration ... Full Access to All Modules"
  IT_ADMINISTRATOR: Object.fromEntries(MODULES.map((m) => [m, FULL])) as ModuleGrants,

  // "view unit inventory and tripping request from client" — view & print
  SALES: {
    UNIT_INVENTORY: READ_PRINT,
    SCHEDULING: READ_PRINT,
  },

  // "In charge in client masterfile (add, delete & update) ... OCR ..."
  DOCUMENTATION: {
    DOCUMENTARY_REQUIREMENTS: FULL,
    OCR_VALIDATION: FULL,
    RESERVATION_VERIFICATION: FULL,
    CLIENT_PROFILE: FULL,
  },

  // "Monitor Account due for application ... View & Print Report"
  LOAN_OFFICER: {
    CLIENT_PROFILE: READ_PRINT,
    PAYMENT_MONITORING: READ_PRINT,
  },

  // "Generate SOA, Apply payment ... Create, modify, delete, view, sending"
  BILLING: {
    SOA_GENERATION: FULL,
    PAYMENT_TERM_MONITORING: FULL,
  },

  // "View dashboards, monitor reservations ... and approve reservation
  //  cancellations and other management-level transactions."
  ACCOUNT_RECEIVABLES: {
    DASHBOARD: FULL,
    REPORTS: FULL,
    ANALYTICS: FULL,
    APPROVAL_MONITORING: FULL,
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

  // "Upload announcement, project details"
  MARKETING: {
    ADVERTISEMENT: ['view', 'create', 'modify', 'delete'],
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
  // Approval is a supervisor act regardless of module, per the sheet's note.
  if (permission === 'approve') {
    return actor.isSupervisor && grantsFor(actor.role, module).length > 0;
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
