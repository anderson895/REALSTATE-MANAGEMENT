/**
 * SFSR-REMS shared UI.
 *
 * Cross-app components used by BOTH the Portal and the Internal Management
 * System. App-specific components stay in their own app — only genuinely
 * shared pieces belong here (Development Plan.md §5.1).
 *
 * This file used to describe itself as "shadcn/ui primitives". It was not:
 * shadcn was never initialised — no components.json, no Radix — and every
 * component here is hand-written. `ConfirmDialog` is the first exception, and
 * it is built on `@radix-ui/react-dialog`, the primitive shadcn's own Dialog
 * wraps, because focus trapping and scroll locking are not things worth
 * hand-rolling twice.
 */

export { cn } from './cn';
export { AppShell, StatusBadge, type AppShellProps } from './sidebar';
export { NavLinks } from './nav-links';
export { isActivePath } from './active-path';
export type { NavItem, NavSection } from './sidebar-types';
export { SHELL_STYLES, type ShellVariant, type ShellStyles } from './shell-theme';
export { MobileNav } from './mobile-nav';
export { SidebarToggle } from './sidebar-toggle';
export { AuthLayout } from './auth-layout';
export { ThemeProvider, ThemeToggle, ThemeToggleCompact, useTheme } from './theme';
export { PageHeader, Card, EmptyState, LockedState } from './page';
export { ConfirmDialog, type ConfirmTone } from './confirm-dialog';
export { Modal } from './modal';
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
