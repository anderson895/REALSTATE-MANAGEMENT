import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from './cn';
import { MobileNav } from './mobile-nav';
import { SidebarToggle } from './sidebar-toggle';
import { SHELL_STYLES, type ShellVariant } from './shell-theme';
import type { NavSection } from './sidebar-types';

/**
 * Sidebar application shell, shared by both apps.
 *
 * The Portal must use side navigation — an explicit client instruction:
 * "Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid.
 *  Mas neat kasi tignan. Para nasa isang side lang."
 * The Internal system uses the same shell so the two feel like one product.
 *
 * LAYOUT NOTES
 *
 * The aside is `sticky top-0 h-screen`, not just a flex child. Without that it
 * scrolls away with the page: on a long project list the brand and the whole
 * menu disappear off the top and only the footer stays in view.
 *
 * `h-screen` pins it to the viewport and the nav scrolls INTERNALLY, which
 * matters for the Internal system — an IT Administrator sees 20 items across
 * five groups, more than fits on a laptop screen.
 *
 * Below `md` the aside is hidden and `MobileNav` takes over with a drawer.
 */

export type { NavItem, NavSection } from './sidebar-types';
export type { ShellVariant } from './shell-theme';

/**
 * `next/link` is imported directly rather than injected as a prop.
 *
 * The injected version could not work: `AppShell` is a Server Component and
 * `MobileNav` is a Client Component, and a function cannot cross that
 * boundary — React rejects it with "Functions cannot be passed directly to
 * Client Components". The abstraction was speculative anyway: both consumers
 * are Next.js apps (§3.8, YAGNI).
 */
export interface AppShellProps {
  readonly brand: string;
  readonly subtitle?: string;
  readonly sections: readonly NavSection[];
  readonly currentPath: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  /**
   * Which skin to wear. Defaults to `light`, so the Internal system keeps the
   * neutral sidebar it already had without changing its call.
   */
  readonly variant?: ShellVariant;
  /**
   * Company mark, shown beside the name on the brand plate.
   *
   * A node rather than a `src` string: the Portal passes a `next/image` so the
   * logo is optimised and sized at build time, and nothing about that belongs
   * in a shared package that does not know where the file lives.
   */
  readonly logo?: ReactNode;
  /**
   * Sticky bar across the top of the CONTENT column — who is signed in,
   * notifications. Distinct from `footer`, which sits inside the sidebar.
   */
  readonly topbar?: ReactNode;
  /**
   * Panel between the menu and the footer — the buyer portal puts a project
   * render there, per the reference design.
   *
   * Desktop only, and deliberately: on a phone the drawer already has to fit
   * the whole menu plus the footer in one viewport, and a decorative photo is
   * the first thing that should lose that argument.
   */
  readonly media?: ReactNode;
}

/**
 * Height of the brand plate AND the topbar. They MUST match.
 *
 * Both used to size themselves from their own contents, so the sidebar's plate
 * came out at ~79px (three lines of wrapped brand text plus `py-4`) and the
 * topbar at ~51px (an avatar plus `py-2`). The two white areas met at the top
 * of the page in a visible step. Pinning both to one constant is what stops
 * that from drifting back the next time either one's copy changes.
 */
const HEADER_HEIGHT = 'h-16';

export function AppShell({
  brand,
  subtitle,
  sections,
  currentPath,
  footer,
  children,
  variant = 'light',
  logo,
  topbar,
  media,
}: AppShellProps) {
  const s = SHELL_STYLES[variant];

  return (
    <div className="min-h-screen bg-canvas text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <MobileNav
        brand={brand}
        subtitle={subtitle}
        sections={sections}
        currentPath={currentPath}
        footer={footer}
        variant={variant}
        logo={logo}
      />

      <div className="flex">
        {/* sticky + h-screen: stays pinned while only the main column scrolls */}
        <aside
          className={cn('sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r transition-[width] duration-200 md:flex',
            'rail:w-16', s.surface)}
        >
          <div
            className={cn(
              'flex shrink-0 items-center gap-2.5 px-5',
              'rail:justify-center rail:px-0',
              HEADER_HEIGHT,
              s.brandBlock,
            )}
          >
            {logo}
            <div className="min-w-0 rail:hidden">
              <p className={s.brandText}>{brand}</p>
              {subtitle ? <p className={cn('mt-0.5', s.subtitleText)}>{subtitle}</p> : null}
            </div>
          </div>

          {/*
           * min-h-0 is required for overflow to work inside a flex column.
           *
           * Without `media` the nav takes the slack, as it always has. WITH
           * media it only takes what it needs and hands the rest to the photo
           * — otherwise a seven-item menu left ~285px of bare green above the
           * render, and the sidebar looked half-finished. `shrink` (not
           * `shrink-0`) keeps a twenty-item menu able to scroll instead of
           * pushing the photo off the bottom.
           */}
          <nav
            className={cn(
              'min-h-0 overflow-y-auto px-3 py-4',
              media ? 'shrink' : 'flex-1',
            )}
          >
            {sections.map((section, i) => (
              <div key={section.title ?? i} className={cn(i > 0 && 'mt-6')}>
                {section.title ? (
                  <p className={cn('px-2 pb-2 rail:hidden', s.sectionTitle)}>{section.title}</p>
                ) : null}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active =
                      currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={item.label}
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
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                s.badge,
                              )}
                            >
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

          {/* Sits BELOW the scrolling nav, so a long menu never pushes it out
              of reach and it never steals height the menu needs. */}
          {media ? <div className="min-h-40 flex-1 overflow-hidden rail:hidden">{media}</div> : null}

          {footer ? <div className={cn('shrink-0 px-4 py-3 rail:hidden', s.footer)}>{footer}</div> : null}
        </aside>

        <main className="min-w-0 flex-1">
          {/*
           * Sticky on desktop so the account chip is reachable without
           * scrolling back up — the reservation wizard is several viewports
           * tall.
           *
           * Deliberately NOT sticky below `md`: `MobileNav` already pins its
           * own header at top-0, and a second sticky element at the same
           * offset does not stack, it overlaps. On a phone this bar simply
           * scrolls away and the drawer carries the navigation.
           */}
          {topbar ? (
            <div
              className={cn(
                'relative z-20 flex items-center border-b border-neutral-200 bg-white/95 backdrop-blur md:sticky md:top-0 dark:border-neutral-800 dark:bg-neutral-900/95',
                HEADER_HEIGHT,
              )}
            >
              <SidebarToggle className="ml-3 hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 md:flex dark:hover:bg-neutral-800" />
              {topbar}
            </div>
          ) : null}
          {children}
        </main>
      </div>
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
