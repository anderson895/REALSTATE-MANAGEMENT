import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@sfsr/ui';
import type { PublicNavItem } from '@/lib/navigation';

/**
 * Shell for visitors who are not signed in.
 *
 * The sidebar is for the buyer's account: "kapag hindi pa nakalogin ang user
 * alisin muna ang side bar". A logged-out visitor is reading a brochure, not
 * working through an application, and a 256px menu of mostly locked items is
 * dead weight on a page whose job is to sell.
 *
 * So the nav goes horizontal and the content gets the full width — which is
 * also what the reference design does for its public pages, and what the hero
 * on the landing page was drawn for.
 *
 * A Server Component: nothing here has state. The nav scrolls horizontally on
 * a phone rather than collapsing into a drawer — four links fit, and a
 * hamburger for four links is a tap that buys nothing.
 */
export function PublicShell({
  items,
  currentPath,
  children,
}: {
  items: readonly PublicNavItem[];
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          {/* The mark is a tall 71×128 glyph cropped to its ink, so height
              drives the size and the width follows. */}
          <Image
            src="/logo.png"
            alt=""
            width={71}
            height={128}
            className="h-10 w-auto object-contain"
            priority
          />
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-brand-600">St. Francis Square Realty</span>
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-neutral-500">
              Real Estate Portal
            </span>
          </span>
        </Link>

        {/* order-3 + w-full drops the nav onto its own line once the bar wraps,
            rather than letting it squeeze the brand and the sign-in button. */}
        <nav className="scrollbar-none order-3 flex w-full items-center gap-6 overflow-x-auto lg:order-none lg:w-auto">
          {items.map((item) => {
            const active =
              currentPath === item.href || currentPath.startsWith(`${item.href}/`);
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

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9.5" />
              <circle cx="12" cy="10" r="3.2" />
              <path d="M5.5 19.2a7 7 0 0 1 13 0" />
            </svg>
            Register / Login
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 px-6 py-4 text-center text-sm text-neutral-500">
        St. Francis Square Realty Corporation &middot; SFSR-REMS
      </footer>
    </div>
  );
}
