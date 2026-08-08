import { HardHat } from 'lucide-react';
import { ROLE_LABELS, isInternalRole, type InternalRole, type Module } from '@sfsr/domain';

/**
 * The screen behind a menu item that has not been built yet.
 *
 * ── Why this exists instead of a 404 ──────────────────────────────────────
 *
 * The internal menu is generated from the RBAC matrix — `navigationFor(role)`
 * filters the route list against `modulesFor(role)`, so every module a role
 * holds produces a link (see lib/navigation.tsx). That is the right design and
 * it has one consequence: a module in RBAC.xls whose screen is not written yet
 * still gets a link, and the link 404s.
 *
 * Eleven of them did. A Cash Clerk signing in saw "Payment Records", clicked
 * it, and got a page not found — which reads as "the system is broken", not as
 * "that part is not finished". The distinction matters most to exactly the
 * person least able to tell the difference.
 *
 * ── Why it still checks the module ────────────────────────────────────────
 *
 * Each page calls `requireModule()` before rendering this, even though there is
 * no data behind it to protect. Two reasons: the gate is what tells the reader
 * which module the route belongs to, and it means the screen is already
 * authorised correctly on the day someone replaces the placeholder with the
 * real thing. A page that starts life ungated tends to ship that way.
 *
 * ── Why it lists what the screen will do ──────────────────────────────────
 *
 * "Coming soon" tells a member of staff nothing they can act on. The bullets
 * are transcribed from that module's row in RBAC.xls, so the page doubles as
 * the specification for whoever builds it and as an answer to "is my job going
 * to be in here" for whoever is waiting.
 */
export function UnderDevelopment({
  title,
  module,
  summary,
  planned,
  owners,
}: {
  title: string;
  /** Omitted only by screens that sit behind no module, such as /change-password. */
  module?: Module;
  /** One line on what the screen is for, from RBAC.xls. */
  summary: string;
  /** What it will do when it is built. */
  planned: readonly string[];
  /** The roles that will use it, for the footnote. */
  owners?: readonly InternalRole[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500"
          >
            <HardHat className="h-4 w-4" strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-navy-800">{title}</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Under development
          </span>
        </div>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-neutral-300" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">{summary}</p>
      </header>

      <section className="overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-white shadow-sm">
        <header className="border-b border-dashed border-neutral-300 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Planned for this screen
          </h2>
        </header>

        <ul className="divide-y divide-neutral-100">
          {planned.map((item) => (
            <li key={item} className="flex items-start gap-3 px-5 py-3">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300"
              />
              <p className="text-sm leading-relaxed text-neutral-600">{item}</p>
            </li>
          ))}
        </ul>

        <p className="border-t border-dashed border-neutral-300 px-5 py-3 text-[11px] leading-relaxed text-neutral-500">
          Coming soon. Your access to this screen is already set up
          {module ? (
            <>
              {' '}
              — it sits behind the{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-[10px]">{module}</code>{' '}
              module
            </>
          ) : null}
          {owners && owners.length > 0 ? (
            <>
              , and it is{' '}
              {owners
                .filter((role) => isInternalRole(role))
                .map((role) => ROLE_LABELS[role])
                .join(' and ')}
              &rsquo;s screen
            </>
          ) : null}
          . Nothing you need to do here yet.
        </p>
      </section>
    </div>
  );
}
