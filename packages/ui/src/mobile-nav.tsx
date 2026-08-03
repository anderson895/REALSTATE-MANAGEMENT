'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from './cn';
import { ThemeToggleCompact } from './theme';
import { SHELL_STYLES, type ShellVariant } from './shell-theme';
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
  variant = 'light',
  logo,
  trailing,
}: {
  brand: string;
  subtitle?: string;
  sections: readonly NavSection[];
  currentPath: string;
  footer?: ReactNode;
  variant?: ShellVariant;
  logo?: ReactNode;
  /**
   * Sits at the right of the mobile header — the account chip.
   *
   * On a phone the shell's `topbar` is hidden and its contents come here
   * instead, so who-is-signed-in shares the row with the hamburger rather than
   * taking a second full-width band under it.
   */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const s = SHELL_STYLES[variant];

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
      {/* The bar itself stays neutral in both skins. A green header plus a
          green drawer behind it left the hamburger sitting on the same colour
          it opens, with nothing to say it was a control. */}
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
            compact cycler lives in the header instead. It renders nothing when
            the app pins a theme. */}
        <ThemeToggleCompact className="shrink-0" />
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </header>

      {/*
       * Always mounted, shown and hidden with classes.
       *
       * It used to be `{open ? … : null}`, which cannot animate: React removes
       * the node the instant it closes, so there is nothing left on screen to
       * transition. Keeping it mounted lets the panel slide and the backdrop
       * fade both ways.
       *
       * `visibility` is in the transition list on purpose. It is what keeps
       * the drawer out of the tab order and the accessibility tree while
       * closed — but as a transitioned property it holds `visible` for the
       * full duration on the way out, so the slide plays to the end instead of
       * being cut off at frame one.
       *
       * `inert` is the belt to that braces: while closed, nothing inside can
       * be focused or read out, even mid-animation.
       */}
      <div
        inert={!open}
        className={cn(
          'fixed inset-0 z-40 transition-[visibility] duration-200 md:hidden',
          'motion-reduce:transition-none',
          open ? 'visible' : 'invisible',
        )}
      >
        <button
          type="button"
          aria-label="Close navigation"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={cn(
            'absolute inset-0 bg-black/40 transition-opacity duration-200 ease-out',
            'motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex w-72 flex-col border-r',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            open ? 'translate-x-0' : '-translate-x-full',
            s.surface,
          )}
        >
            <div className={cn('flex shrink-0 items-center gap-2.5 px-5 py-4', s.brandBlock)}>
              {logo}
              <div className="min-w-0 flex-1">
                <p className={s.brandText}>{brand}</p>
                {subtitle ? <p className={cn('mt-0.5', s.subtitleText)}>{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className={cn('shrink-0 rounded-md p-1', s.closeButton)}
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
                    <p className={cn('px-2 pb-2', s.sectionTitle)}>{section.title}</p>
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
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                              active ? s.itemActive : s.item,
                            )}
                          >
                            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

          {footer ? <div className={cn('shrink-0 px-4 py-3', s.footer)}>{footer}</div> : null}
        </div>
      </div>
    </>
  );
}
