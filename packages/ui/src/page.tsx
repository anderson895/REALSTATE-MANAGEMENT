import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Page furniture shared by both apps.
 *
 * Defined once so a screen with no data yet still looks deliberate. An empty
 * table under a bare heading reads as a broken page; a stated reason plus the
 * next action reads as a system that is working and simply has nothing to show.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? <div className="mb-4 text-neutral-300 dark:text-neutral-600">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 max-w-md text-sm text-neutral-500">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {actionLabel}
        </Link>
      ) : null}
    </Card>
  );
}

/**
 * For features that exist but are not available at this account tier.
 *
 * Deliberately not a redirect. RESERVATION.doc reserves the SOA and payment
 * history for a Permanent Client, and bouncing an Initial Account away teaches
 * them nothing. Naming the gate — sign the Contract to Sell — is the whole
 * point of the screen.
 */
export function LockedState({
  title,
  description,
  requirement,
}: {
  title: string;
  description: string;
  requirement: string;
}) {
  return (
    <Card className="px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-neutral-400"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">{description}</p>
      <p className="mx-auto mt-4 max-w-md rounded-md bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        {requirement}
      </p>
    </Card>
  );
}
