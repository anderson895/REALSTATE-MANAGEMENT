import {
  BadgeCheck,
  FlaskConical,
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
  Settings2,
  ShieldCheck,
  UserPlus,
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
   * Narrows a route to specific roles, on top of the module grant.
   *
   * Needed because two screens now sit behind RESERVATION_VERIFICATION and
   * mean different things: Documentation and Billing get the verification
   * queue, Sales gets the closed sales that came out of it. Without this the
   * module alone would show each of them both.
   */
  readonly roles?: readonly InternalRole[];
  /**
   * Shown only in `next dev`.
   *
   * The page behind it 404s in a production build, and a menu item pointing at
   * a 404 is worse than no menu item. Written as a literal comparison at the
   * filter below so the bundler can fold it away.
   */
  readonly devOnly?: boolean;
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
    // The verification queue. Sales holds the module but must not see this —
    // it is the half-finished work note.txt keeps from them.
    roles: ['DOCUMENTATION', 'BILLING'],
  },
  {
    module: 'RESERVATION_VERIFICATION',
    href: '/sales/reservations',
    label: 'My Sales',
    group: 'Sales',
    icon: BadgeCheck,
    roles: ['SALES'],
  },
  /*
   * The walk-in counter.
   *
   * note.txt: "Add walking reservation on internal same process sa web portal",
   * then "documentation ang in charge for walk in application".
   *
   * `roles` narrows it to Documentation, but the real gate is the `create`
   * permission the page and every action re-check: Billing holds this module
   * with view/modify/print and Sales with view/print, so neither can raise one
   * even if they reached the URL. The role list keeps the link out of their
   * sidebar; the grant is what refuses them.
   */
  {
    module: 'RESERVATION_VERIFICATION',
    href: '/walk-in',
    label: 'Walk-in Reservation',
    group: 'Processing',
    icon: UserPlus,
    roles: ['DOCUMENTATION'],
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
  /*
   * OCR Validation is deliberately not in this menu.
   *
   * Removed on the client's instruction ("alisin nadin ang OCR VALIDATION sa
   * internal"). It pointed at /documents/ocr, which was never built, so the
   * only thing it ever did was offer a link that 404s.
   *
   * The OCR_VALIDATION module stays in the RBAC matrix because it is a row in
   * RBAC.xls, and dropping it there would mean re-transcribing the workbook to
   * remove a menu item. Nothing reads the grant now.
   *
   * NOT to be confused with the buyer-side ID check, which is untouched and
   * still runs: apps/portal/.../use-id-check.ts validates an uploaded ID
   * against `validateIdUpload` in @sfsr/domain as the buyer submits it.
   */
  // "Clients profiles change to Client Master Files" (note.txt). The MODULE
  // key stays CLIENT_PROFILE — that is the name in RBAC.xls, and renaming it
  // would mean re-transcribing the matrix to change a label on a menu.
  {
    module: 'CLIENT_PROFILE',
    href: '/clients',
    label: 'Client Master Files',
    group: 'Processing',
    icon: UsersRound,
  },

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
  /*
   * note.txt leaves IT with maintenance and adding users. This is the
   * maintenance half — clearing reservation data during development, with the
   * unit holds, payments, documents and counter that go with it.
   */
  {
    module: 'USER_MANAGEMENT',
    href: '/admin/maintenance',
    label: 'Maintenance',
    group: 'Administration',
    icon: FlaskConical,
    devOnly: true,
  },
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
  const isDev = process.env.NODE_ENV === 'development';
  const visible = ROUTES.filter(
    (r) =>
      (r.always || granted.has(r.module)) &&
      (!r.roles || r.roles.includes(role)) &&
      (!r.devOnly || isDev),
  );

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
