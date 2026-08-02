/**
 * SFSR-REMS shared UI.
 *
 * shadcn/ui primitives and cross-app components used by BOTH the Portal and
 * the Internal Management System. App-specific components stay in their own
 * app — only genuinely shared pieces belong here (Development Plan.md §5.1).
 */

export { cn } from './cn';
export {
  AppShell,
  StatusBadge,
  type AppShellProps,
  type NavItem,
  type NavSection,
} from './sidebar';
