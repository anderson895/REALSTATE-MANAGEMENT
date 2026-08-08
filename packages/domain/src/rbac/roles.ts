/**
 * Roles and modules, transcribed from `RBAC.xls` sheet `USER ROLE ACCESS`.
 *
 * This lives in the domain rather than in an app because both applications
 * need it: the Internal system to render menus and gate actions, the Portal to
 * gate client tiers. One matrix, two consumers, no drift (§3.1).
 */

/** The ten internal roles in the USER ROLE ACCESS matrix. */
export const INTERNAL_ROLES = [
  'IT_ADMINISTRATOR',
  'SALES',
  'DOCUMENTATION',
  'LOAN_OFFICER',
  'BILLING',
  'ACCOUNT_RECEIVABLES',
  'ACCOUNTING',
  'CASH_CLERK',
  'MARKETING',
  'LEGAL_COUNSEL',
] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

/** Client account tiers from the "Client Access" block of the same sheet. */
export const CLIENT_TIERS = ['GUEST', 'INITIAL', 'PERMANENT'] as const;
export type ClientTier = (typeof CLIENT_TIERS)[number];

/** Modules named in the MODULE column. */
export const MODULES = [
  'UNIT_INVENTORY',
  'SCHEDULING',
  'DOCUMENTARY_REQUIREMENTS',
  'OCR_VALIDATION',
  'RESERVATION_VERIFICATION',
  'CLIENT_PROFILE',
  'PAYMENT_MONITORING',
  'SOA_GENERATION',
  'PAYMENT_TERM_MONITORING',
  'DASHBOARD',
  'REPORTS',
  'ANALYTICS',
  'APPROVAL_MONITORING',
  'PAYMENT',
  'OFFICIAL_RECEIPT',
  'FINANCIAL_REPORTS',
  'PAYMENT_RECORDS',
  'ADVERTISEMENT',
  'AUDIT_TRAIL',
  'USER_MANAGEMENT',
] as const;
export type Module = (typeof MODULES)[number];

/** Verbs from the "Primary Access Rights" column. */
export const PERMISSIONS = [
  'view',
  'create',
  'modify',
  'delete',
  'print',
  'send',
  'approve',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Human-readable labels for menus and audit entries.
 *
 * These name the ROLE only — never the rank.
 *
 * Four of them read "… Staff" in RBAC.xls, and that word is a rank, not part
 * of the role: the sheet carries the rank separately in its own `userRole`
 * column ("Staff" / "Supervisor"), which is what `isSupervisor` is built from.
 * Holding it in both places meant the two could contradict each other, and
 * they did — the topbar showed the Documentation SUPERVISOR as
 * "Documentation Staff · Supervisor", asserting both ranks in one line.
 *
 * Rank is displayed beside these, from `isSupervisor`. One fact, one home.
 */
export const ROLE_LABELS: Record<InternalRole, string> = {
  IT_ADMINISTRATOR: 'IT Administrator',
  SALES: 'Sales Agent / Broker / Group Head',
  DOCUMENTATION: 'Documentation',
  LOAN_OFFICER: 'Loan Officer',
  BILLING: 'Billing',
  ACCOUNT_RECEIVABLES: 'Account Receivables Officer',
  ACCOUNTING: 'Accounting',
  CASH_CLERK: 'Cash Clerk',
  MARKETING: 'Marketing',
  LEGAL_COUNSEL: 'Legal Counsel',
};

/**
 * Maps a personnel sheet in `RBAC.xls` to its role.
 *
 * The `Department` column cannot do this on its own: nine employees share
 * "Loans Management Department" but split across three roles with genuinely
 * different rights — Documentation, Billing and Loans. The sheet a person
 * appears on is the only field that separates them (Development Plan.md §12.28).
 */
const SHEET_TO_ROLE: Record<string, InternalRole> = {
  IT: 'IT_ADMINISTRATOR',
  RECEIVABLES: 'ACCOUNT_RECEIVABLES',
  CASH: 'CASH_CLERK',
  DOCUMENTATION: 'DOCUMENTATION',
  BILLING: 'BILLING',
  LOANS: 'LOAN_OFFICER',
  ACCOUNTING: 'ACCOUNTING',
  LEGAL: 'LEGAL_COUNSEL',
  MARKETING: 'MARKETING',
  SALES: 'SALES',
};

export function resolveRoleFromSheet(sheetName: string): InternalRole | null {
  return SHEET_TO_ROLE[sheetName.trim().toUpperCase()] ?? null;
}

export function isInternalRole(value: unknown): value is InternalRole {
  return typeof value === 'string' && (INTERNAL_ROLES as readonly string[]).includes(value);
}

export function isClientTier(value: unknown): value is ClientTier {
  return typeof value === 'string' && (CLIENT_TIERS as readonly string[]).includes(value);
}
