'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from './cn';
import { ThemeToggleCompact } from './theme';
import type { NavSection } from './sidebar-types';

/**
 * Mobile navigation drawer.
 *
 * The desktop sidebar is hidden below `md`, which on its own leaves a phone
 * with no navigation at all — unacceptable for the buyer portal, where most
 * property browsing in the Philippines happens on a phone.
 *
 * A client island rather than a server component: it needs open/closed state.
 * The desktop shell stays server-rendered.
 */
export function MobileNav({
  brand,
  subtitle,
  sections,
  currentPath,
  footer,
}: {
  brand: string;
  subtitle?: string;
  sections: readonly NavSection[];
  currentPath: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Close on navigation — otherwise the drawer stays open over the new page
  // when the user goes back or forward.
  //
  // Adjusted during render rather than inside an effect. An effect would paint
  // the stale open drawer first and then re-render to close it; this is
  // React's documented pattern for reacting to a changed prop.
  const [lastPath, setLastPath] = useState(currentPath);
  if (currentPath !== lastPath) {
    setLastPath(currentPath);
    setOpen(false);
  }

  // This one IS an effect: document.body is an external system, which is
  // exactly what effects are for.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-900/95">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brand-700 dark:text-brand-300">
            {brand}
          </p>
          {subtitle ? <p className="truncate text-[11px] text-neutral-500">{subtitle}</p> : null}
        </div>
        {/* The sidebar's theme picker is unreachable on a phone, so the
            compact cycler lives in the header instead. */}
        <ThemeToggleCompact className="shrink-0" />
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex shrink-0 items-start justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div>
                <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{brand}</p>
                {subtitle ? <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
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
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                              active
                                ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
                            )}
                          >
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {footer ? (
              <div className="shrink-0 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
