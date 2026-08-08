import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import type { NavSection } from '@sfsr/ui';

/**
 * The landing screen for a role that holds no inventory.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `/` is where `requireModule()` sends anyone it turns away, so every role has
 * to land somewhere useful — and until now every role landed on the same unit
 * inventory dashboard. Five of the eight roles that reach it hold no
 * UNIT_INVENTORY grant at all: Accounting, Cash, Legal, Loans and IT.
 *
 * IT is the one that mattered. note.txt strips that role of the business
 * deliberately — "restrict sales, restrict finance" — and permissions.ts says
 * so in as many words: "Deliberately NOT granted: DASHBOARD and ANALYTICS. Both
 * report on sales and collections, which is business data." The dashboard then
 * showed an administrator the unit count, the highest unit price and a
 * per-project sales breakdown anyway. The matrix was right and the landing page
 * was not asking it.
 *
 * ── Why it is built from the MENU and not from a list here ───────────────
 *
 * `navigationFor(role)` already filters the route table against
 * `modulesFor(role)`. Reusing its output means this screen cannot offer a
 * module the sidebar denies, or miss one the sidebar shows, and a route added
 * to the table appears in both without being written twice.
 */
export function ModuleLauncher({
  sections,
  roleLabel,
}: {
  /** Straight from `navigationFor(role)` — the same list the sidebar renders. */
  sections: readonly NavSection[];
  roleLabel: string;
}) {
  // The dashboard itself is `always` in the route table, so every role has it
  // and nobody needs a card pointing at the page they are standing on.
  const groups = sections
    .map((section) => ({ ...section, items: section.items.filter((i) => i.href !== '/') }))
    .filter((section) => section.items.length > 0);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Your Modules
        </h2>
        <span className="text-[11px] font-medium text-neutral-500">
          {total} {total === 1 ? 'screen' : 'screens'}
        </span>
      </header>

      {total === 0 ? (
        <div className="px-6 py-12 text-center">
          <ShieldCheck
            className="mx-auto mb-2 h-6 w-6 text-neutral-300"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-navy-800">No modules assigned</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
            The {roleLabel} role reaches nothing in the RBAC matrix. That is a seeding fault rather
            than a permission — an IT Administrator can correct the role at Users &amp; Roles.
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                {group.title}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={{ pathname: item.href }}
                      className="flex items-center gap-2.5 rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm text-neutral-700 transition-colors hover:border-navy-300 hover:bg-navy-50/50 hover:text-navy-800"
                    >
                      {/* The same icon the sidebar draws, handed down as an
                          element — one route table, one glyph per screen. */}
                      <span className="shrink-0 text-navy-600">{item.icon}</span>
                      <span className="flex-1 truncate font-medium">{item.label}</span>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-neutral-300"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-neutral-200/80 px-5 py-3 text-[11px] leading-relaxed text-neutral-500">
        This is everything the {roleLabel} role reaches. Unit inventory, sales figures and
        collections are not on it because the RBAC matrix does not grant them to this role — not
        because the page is empty.
      </p>
    </section>
  );
}
