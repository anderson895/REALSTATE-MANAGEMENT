import { modulesFor, type InternalRole, type Module } from '@sfsr/domain';
import type { NavSection } from '@sfsr/ui';

/**
 * The internal menu, derived from the RBAC matrix.
 *
 * Nothing here is hand-maintained per role: `modulesFor(role)` returns what
 * `USER ROLE ACCESS` grants, and this filters the route list against it. Add a
 * grant in the matrix and the menu item appears; remove it and the link goes.
 * The two cannot drift apart.
 *
 * The menu is presentation only — hiding a link is not a control. The same
 * grant is re-checked in `requireModule()` and again in the Security Rules
 * (Development Plan.md §3.3).
 */

interface ModuleRoute {
  readonly module: Module;
  readonly href: string;
  readonly label: string;
  readonly group: string;
}

const ROUTES: readonly ModuleRoute[] = [
  { module: 'DASHBOARD', href: '/', label: 'Dashboard', group: 'Overview' },
  { module: 'ANALYTICS', href: '/analytics', label: 'Analytics', group: 'Overview' },

  { module: 'UNIT_INVENTORY', href: '/inventory', label: 'Unit Inventory', group: 'Sales' },
  { module: 'SCHEDULING', href: '/scheduling', label: 'Tripping Schedule', group: 'Sales' },
  { module: 'ADVERTISEMENT', href: '/announcements', label: 'Announcements', group: 'Sales' },

  {
    module: 'RESERVATION_VERIFICATION',
    href: '/reservations',
    label: 'Reservations',
    group: 'Processing',
  },
  {
    module: 'APPROVAL_MONITORING',
    href: '/approvals',
    label: 'Approval Monitoring',
    group: 'Processing',
  },
  {
    module: 'DOCUMENTARY_REQUIREMENTS',
    href: '/documents',
    label: 'Documentary Requirements',
    group: 'Processing',
  },
  { module: 'OCR_VALIDATION', href: '/documents/ocr', label: 'OCR Validation', group: 'Processing' },
  { module: 'CLIENT_PROFILE', href: '/clients', label: 'Client Profiles', group: 'Processing' },

  { module: 'SOA_GENERATION', href: '/billing/soa', label: 'Statements of Account', group: 'Finance' },
  {
    module: 'PAYMENT_TERM_MONITORING',
    href: '/billing/terms',
    label: 'Payment Terms',
    group: 'Finance',
  },
  { module: 'PAYMENT_MONITORING', href: '/loans', label: 'Loan Monitoring', group: 'Finance' },
  { module: 'PAYMENT_RECORDS', href: '/cash', label: 'Payment Records', group: 'Finance' },
  { module: 'PAYMENT', href: '/accounting/payments', label: 'Payments', group: 'Finance' },
  {
    module: 'OFFICIAL_RECEIPT',
    href: '/accounting/receipts',
    label: 'Official Receipts',
    group: 'Finance',
  },
  {
    module: 'FINANCIAL_REPORTS',
    href: '/accounting/reports',
    label: 'Financial Reports',
    group: 'Finance',
  },

  { module: 'REPORTS', href: '/reports', label: 'Reports', group: 'Administration' },
  { module: 'AUDIT_TRAIL', href: '/audit', label: 'Audit Trail', group: 'Administration' },
  { module: 'USER_MANAGEMENT', href: '/admin/users', label: 'Users & Roles', group: 'Administration' },
];

const GROUP_ORDER = ['Overview', 'Sales', 'Processing', 'Finance', 'Administration'] as const;

export function navigationFor(role: InternalRole): NavSection[] {
  const granted = new Set<Module>(modulesFor(role));
  const visible = ROUTES.filter((r) => granted.has(r.module));

  return GROUP_ORDER.map((group) => ({
    title: group,
    items: visible
      .filter((r) => r.group === group)
      .map((r) => ({ href: r.href, label: r.label })),
  })).filter((section) => section.items.length > 0);
}
