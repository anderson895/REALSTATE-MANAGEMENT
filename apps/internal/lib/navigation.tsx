import {
  Banknote,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Megaphone,
  Receipt,
  ScanLine,
  Settings2,
  ShieldCheck,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
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
 *
 * A .tsx file rather than .ts because every route carries its ICON — INTERNAL.xls
 * sheet `USER INTERFACE` draws one beside each menu item. Keeping it on the
 * route means the icon cannot drift away from the label it belongs to, which a
 * second lookup table keyed by href eventually would.
 */

interface ModuleRoute {
  readonly module: Module;
  readonly href: string;
  readonly label: string;
  readonly group: string;
  readonly icon: LucideIcon;
  /**
   * Shown to every role, whatever the matrix says about `module`.
   *
   * Used by exactly one route, and only because the two source documents
   * disagree about it — see the note on the dashboard entry below.
   */
  readonly always?: boolean;
}

const ROUTES: readonly ModuleRoute[] = [
  /**
   * The dashboard, shown to everyone.
   *
   * ── The second place the source documents contradict each other ─────────
   *
   * RBAC.xls, USER ROLE ACCESS: only IT and Account Receivables get DASHBOARD.
   * Read literally, a Documentation Staff has no dashboard link.
   *
   * INTERNAL.xls, sheet USER INTERFACE: every one of the five dashboards it
   * draws — Documentation staff and supervisor, Billing, Account Receivables,
   * Sales Agent — opens its menu with "Dashboard", gold and current. The sheet
   * is titled for the screen it describes: "Documentation Department
   * Dashboard".
   *
   * INTERNAL.xls governs, as it did for the Sales tripping grant (see the note
   * in permissions.ts). It is also the reading the code already assumed: `/`
   * is where `requireEmployee()` lands everyone, so gating only the LINK left
   * Documentation staff on a page with no way back to it — a sidebar holding
   * one collapsed group and no visible item.
   *
   * This grants the LINK, not the data. ANALYTICS still gates the charts on
   * that page, so a role without it gets the landing page and not the figures.
   */
  { module: 'DASHBOARD', href: '/', label: 'Dashboard', group: 'Overview', always: true, icon: LayoutDashboard },

  { module: 'UNIT_INVENTORY', href: '/inventory', label: 'Unit Inventory', group: 'Sales', icon: Building2 },
  { module: 'SCHEDULING', href: '/scheduling', label: 'Tripping Schedule', group: 'Sales', icon: CalendarClock },
  { module: 'ADVERTISEMENT', href: '/announcements', label: 'Announcements', group: 'Sales', icon: Megaphone },

  {
    module: 'RESERVATION_VERIFICATION',
    href: '/reservations',
    label: 'Reservations',
    group: 'Processing',
    icon: ClipboardCheck,
  },
  {
    module: 'APPROVAL_MONITORING',
    href: '/approvals',
    label: 'Approval Monitoring',
    group: 'Processing',
    icon: ShieldCheck,
  },
  {
    module: 'DOCUMENTARY_REQUIREMENTS',
    href: '/documents',
    label: 'Documentary Requirements',
    group: 'Processing',
    icon: FileCheck2,
  },
  { module: 'OCR_VALIDATION', href: '/documents/ocr', label: 'OCR Validation', group: 'Processing', icon: ScanLine },
  { module: 'CLIENT_PROFILE', href: '/clients', label: 'Client Profiles', group: 'Processing', icon: UsersRound },

  { module: 'SOA_GENERATION', href: '/billing/soa', label: 'Statements of Account', group: 'Finance', icon: FileSpreadsheet },
  {
    module: 'PAYMENT_TERM_MONITORING',
    href: '/billing/terms',
    label: 'Payment Terms',
    group: 'Finance',
    icon: CalendarClock,
  },
  { module: 'PAYMENT_MONITORING', href: '/loans', label: 'Loan Monitoring', group: 'Finance', icon: Banknote },
  { module: 'PAYMENT_RECORDS', href: '/cash', label: 'Payment Records', group: 'Finance', icon: Wallet },
  { module: 'PAYMENT', href: '/accounting/payments', label: 'Payments', group: 'Finance', icon: Banknote },
  {
    module: 'OFFICIAL_RECEIPT',
    href: '/accounting/receipts',
    label: 'Official Receipts',
    group: 'Finance',
    icon: Receipt,
  },
  {
    module: 'FINANCIAL_REPORTS',
    href: '/accounting/reports',
    label: 'Financial Reports',
    group: 'Finance',
    icon: FileBarChart,
  },

  { module: 'REPORTS', href: '/reports', label: 'Reports', group: 'Administration', icon: FileBarChart },
  { module: 'AUDIT_TRAIL', href: '/audit', label: 'Audit Trail', group: 'Administration', icon: History },
  { module: 'USER_MANAGEMENT', href: '/admin/users', label: 'Users & Roles', group: 'Administration', icon: Users },
];

const GROUP_ORDER = ['Overview', 'Sales', 'Processing', 'Finance', 'Administration'] as const;

/**
 * The icon on each group's toggle row.
 *
 * The sheet gives a collapsible group the same treatment as a link — icon,
 * label, chevron on the right — so a group without an icon would be the only
 * row in the menu with an empty gutter where every other row has a glyph.
 */
const GROUP_ICONS: Record<(typeof GROUP_ORDER)[number], LucideIcon> = {
  Overview: LayoutDashboard,
  Sales: Building2,
  Processing: ClipboardCheck,
  Finance: Wallet,
  Administration: Settings2,
};

/**
 * The department a role sits in, for the subtitle in the topbar.
 *
 * INTERNAL.xls sheet `USER INTERFACE` heads each dashboard with its department
 * rather than the person's job title — "Documentation Department Dashboard",
 * "Sales Department · Sales Agent Dashboard". The department is what tells
 * someone which of the five near-identical screens they are looking at.
 *
 * Kept apart from `ROLE_LABELS` in the domain package because it is not the
 * same fact: `ROLE_LABELS` names the PERSON's role ("Cash Clerk"), this names
 * the DESK they work at. The sheet shows both, in different places.
 */
const DEPARTMENT_LABELS: Record<InternalRole, string> = {
  IT_ADMINISTRATOR: 'IT Department',
  SALES: 'Sales Department',
  DOCUMENTATION: 'Loans Management — Documentation',
  LOAN_OFFICER: 'Loans Management',
  BILLING: 'Loans Management — Billing',
  ACCOUNT_RECEIVABLES: 'Account Receivables',
  ACCOUNTING: 'Accounting Department',
  CASH_CLERK: 'Cash Department',
  MARKETING: 'Marketing Department',
  LEGAL_COUNSEL: 'Legal Department',
};

export function departmentFor(role: InternalRole): string {
  return DEPARTMENT_LABELS[role];
}

export function navigationFor(role: InternalRole): NavSection[] {
  const granted = new Set<Module>(modulesFor(role));
  const visible = ROUTES.filter((r) => r.always || granted.has(r.module));

  return GROUP_ORDER.map((group) => {
    const GroupIcon = GROUP_ICONS[group];
    return {
      title: group,
      icon: <GroupIcon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />,
      items: visible
        .filter((r) => r.group === group)
        .map((r) => ({
          href: r.href,
          label: r.label,
          // 16px, matching the sheet: large enough to read at a glance, small
          // enough that the label stays the thing being read.
          icon: <r.icon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />,
        })),
    };
  }).filter((section) => section.items.length > 0);
}
