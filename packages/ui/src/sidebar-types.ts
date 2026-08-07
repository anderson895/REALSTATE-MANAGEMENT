import type { ReactNode } from 'react';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Rendered as a count badge, e.g. pending items in a verification queue. */
  readonly badge?: number;
}

export interface NavSection {
  readonly title?: string;
  /**
   * Shown on the section's toggle row, beside its title.
   *
   * INTERNAL.xls sheet `USER INTERFACE` draws a collapsible group as a NAV ITEM
   * that happens to open — same height, same icon, same type as the links under
   * it, with a chevron on the right. Without an icon the toggle reads as a
   * heading instead, which is what it used to be.
   */
  readonly icon?: ReactNode;
  readonly items: readonly NavItem[];
}
