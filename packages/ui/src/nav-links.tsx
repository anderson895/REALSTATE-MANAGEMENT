'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from './cn';
import { isActivePath } from './active-path';
import { SHELL_STYLES, type ShellVariant } from './shell-theme';
import type { NavItem } from './sidebar-types';

/**
 * The list of menu links, and the one thing that decides which is lit.
 *
 * ── Why this is a Client Component and the shell around it is not ────────
 *
 * The highlight used to be computed in `AppShell` from a `currentPath` prop,
 * which each app read in its LAYOUT out of an `x-pathname` header set by the
 * proxy. That is wrong in a way that only shows up once two pages share a
 * layout, and it showed up: a layout is NOT re-rendered during client-side
 * navigation between routes beneath it. Clicking from `/admin/users` to
 * `/admin/maintenance` swapped the page and left `currentPath` holding
 * `/admin/users` from the last full page load — the content changed and the
 * sidebar went on highlighting the page you had left.
 *
 * Every group in both apps has this shape, so it was every group: Sales,
 * Processing, Finance, Administration, and the Portal's public bar.
 *
 * `usePathname()` is the fix because it is a hook — it re-runs on every
 * navigation, client-side ones included, which is exactly the event the header
 * cannot observe. It resolves during SSR too, so the first paint is right and
 * there is no flash of the wrong item.
 *
 * `fallbackPath` covers the one case the hook cannot: rendering outside a Next
 * router. It is the same value the layout used to pass, so nothing regresses if
 * the hook ever comes back null.
 */
export function NavLinks({
  items,
  variant = 'light',
  fallbackPath = '/',
  onNavigate,
}: {
  items: readonly NavItem[];
  variant?: ShellVariant;
  fallbackPath?: string;
  /** Fired when a link is followed — the mobile drawer closes itself on it. */
  onNavigate?: () => void;
}) {
  const s = SHELL_STYLES[variant];
  const pathname = usePathname() ?? fallbackPath;

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                'rail:justify-center rail:px-0',
                active ? s.itemActive : s.item,
              )}
            >
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
              <span className="flex-1 truncate rail:hidden">{item.label}</span>
              {item.badge ? (
                <span
                  className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', s.badge)}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
