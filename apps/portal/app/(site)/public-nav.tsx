'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, isActivePath } from '@sfsr/ui';
import type { PublicNavItem } from '@/lib/navigation';

/**
 * The public bar's links, and the underline that says where you are.
 *
 * ── Why this is a Client Component inside a Server Component shell ───────
 *
 * `PublicShell` used to compute the underline itself from a `currentPath` prop
 * that `(site)/layout.tsx` read out of an `x-pathname` header. That header is
 * set per request by the proxy, and a LAYOUT does not re-render on client-side
 * navigation — so browsing from Projects to Units swapped the page and left
 * the underline sitting under Projects until something forced a full reload.
 *
 * `usePathname()` is a hook, so it re-runs on every navigation including the
 * client-side ones the header cannot see. It also resolves during SSR, so the
 * first paint is already correct.
 *
 * Only the links moved. The brand, the sign-in button and the footer stay in
 * the server-rendered shell — nothing about them depends on where you are.
 */
export function PublicNav({
  items,
  fallbackPath,
}: {
  items: readonly PublicNavItem[];
  /** Used only if the hook returns null — outside a Next router. */
  fallbackPath: string;
}) {
  const pathname = usePathname() ?? fallbackPath;

  return (
    // order-3 + w-full drops the nav onto its own line once the bar wraps,
    // rather than letting it squeeze the brand and the sign-in button.
    <nav className="scrollbar-none order-3 flex w-full items-center gap-6 overflow-x-auto lg:order-none lg:w-auto">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 py-1.5 text-sm transition-colors',
              active
                ? 'border-brand-600 font-semibold text-brand-600'
                : 'border-transparent text-neutral-700 hover:text-brand-600',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
