import { notFound } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { countResettable, devToolsEnabled } from '@/lib/dev-reset';
import { DevTools } from './dev-tools';

/**
 * Maintenance — development-only reset of reservation data.
 *
 * ── Why it sits under Administration ─────────────────────────────────────
 *
 * note.txt leaves IT with two things: "accessible lang sa maintenance system
 * only, accisible add users only". This is the maintenance half. It was a
 * floating panel on every screen for a while, which put a button that deletes
 * every reservation in front of a Billing clerk who has no business seeing it;
 * behind USER_MANAGEMENT it reaches exactly the role the note describes.
 *
 * ── Three gates, and none of them is the menu ────────────────────────────
 *
 *   1. `requireModule('USER_MANAGEMENT')` — IT only.
 *   2. `notFound()` outside `next dev`, so the route does not exist in a
 *      production build even for an administrator.
 *   3. The server action re-checks NODE_ENV itself, because a server action is
 *      a public endpoint whether or not a page points at it.
 *
 * The menu entry is hidden in production too, but that is cosmetic — hiding a
 * link has never been a control in this system and is not one here.
 */
export default async function MaintenancePage() {
  const session = await requireModule('USER_MANAGEMENT');

  // Not a redirect: outside development this route genuinely does not exist,
  // and 404 says that. A redirect would imply it is somewhere else.
  if (!devToolsEnabled()) notFound();

  const counts = await countResettable();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
          >
            <FlaskConical className="h-4 w-4" strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-navy-800">Maintenance</h1>
        </div>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Development tools for {session.displayName.split(' ')[0]}. This page does not exist in a
          production build.
        </p>
      </header>

      {/*
       * The warning is here rather than inside the panel because it explains
       * why the tool exists at all, and that is worth reading once rather than
       * every time the panel is opened.
       */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">Why clear from here, not from Firebase</p>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90">
          A reservation is not one document. Submitting one writes to{' '}
          <span className="font-medium">reservations</span>,{' '}
          <span className="font-medium">payments</span> and{' '}
          <span className="font-medium">documents</span>, advances a counter, holds a unit and a
          parking slot, and appends to the audit trail. Deleting one collection in the console
          leaves the other six behind — which is how unit EU001 ended up held for ever against a
          reservation that no longer existed, unreservable by anyone.
        </p>
      </div>

      <DevTools counts={counts} />
    </div>
  );
}
