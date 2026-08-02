import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Sidebar application shell, shared by both apps.
 *
 * The Portal must use side navigation — an explicit client instruction:
 * "Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid.
 *  Mas neat kasi tignan. Para nasa isang side lang."
 * The Internal system uses the same shell so the two feel like one product.
 */

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

export interface AppShellProps {
  readonly brand: string;
  readonly subtitle?: string;
  readonly sections: readonly NavSection[];
  readonly currentPath: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  /** Anchor tag component — `next/link` is injected so @sfsr/ui stays framework-agnostic. */
  readonly LinkComponent: React.ComponentType<{
    href: string;
    className?: string;
    children: ReactNode;
  }>;
}

export function AppShell({
  brand,
  subtitle,
  sections,
  currentPath,
  footer,
  children,
  LinkComponent: Link,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{brand}</p>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, i) => (
            <div key={section.title ?? i} className={cn(i > 0 && 'mt-6')}>
              {section.title ? (
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
                        )}
                      >
                        {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {footer ? (
          <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            {footer}
          </div>
        ) : null}
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/** Consistent unit-status pill, so a status reads the same in both apps. */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'Available'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300'
      : status === 'On Hold'
        ? 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300'
        : status === 'Sold'
          ? 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300'
          : 'bg-neutral-100 text-neutral-700 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-300';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tone,
      )}
    >
      {status}
    </span>
  );
}
