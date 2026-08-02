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
  readonly items: readonly NavItem[];
}
