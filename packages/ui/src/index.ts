/**
 * SFSR-REMS shared UI.
 *
 * shadcn/ui primitives and cross-app components used by BOTH the Portal and
 * the Internal Management System. App-specific components stay in their own
 * app — only genuinely shared pieces belong here (Development Plan.md §5.1).
 */

export { cn } from './cn';
export { AppShell, StatusBadge, type AppShellProps } from './sidebar';
export type { NavItem, NavSection } from './sidebar-types';
export { SHELL_STYLES, type ShellVariant, type ShellStyles } from './shell-theme';
export { MobileNav } from './mobile-nav';
export { SidebarToggle } from './sidebar-toggle';
export { AuthLayout } from './auth-layout';
export { ThemeProvider, ThemeToggle, ThemeToggleCompact, useTheme } from './theme';
export { PageHeader, Card, EmptyState, LockedState } from './page';
export {
  cloudinaryUrl,
  MissingAsset,
  ProjectPlaceholder,
  type TransformOptions,
} from './cloudinary-image';
export {
  TextField,
  Checkbox,
  SubmitButton,
  FormError,
  fieldClass,
  type TextFieldProps,
} from './form';
