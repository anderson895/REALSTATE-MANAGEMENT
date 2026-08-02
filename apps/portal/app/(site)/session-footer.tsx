'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';
import { ThemeToggle } from '@sfsr/ui';
import type { ClientTier } from '@sfsr/domain';

/**
 * Who is signed in, at the bottom of the sidebar.
 *
 * The person's NAME is the heading; the account tier is a small badge beneath
 * it. Leading with "Initial Account" told a buyer their classification rather
 * than greeting them — the tier matters to St. Francis Square Realty, not to
 * the person looking at the screen.
 *
 * The name comes from the session token's `name` claim, so rendering it costs
 * no Firestore read (Development Plan.md §12.30).
 */

const TIER_BADGE: Record<Exclude<ClientTier, 'GUEST'>, { label: string; className: string }> = {
  INITIAL: {
    label: 'Initial Account',
    className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  },
  PERMANENT: {
    label: 'Permanent Client',
    className: 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-300',
  },
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function SessionFooter({
  tier,
  displayName,
  username,
}: {
  tier: ClientTier;
  displayName?: string;
  username?: string;
}) {
  const router = useRouter();

  if (tier === 'GUEST') {
    return (
      <div className="space-y-2">
        <ThemeToggle />
        <p className="text-xs text-neutral-500">Browsing as guest</p>
        <Link
          href="/login"
          className="block rounded-md bg-brand-600 px-2.5 py-1.5 text-center text-xs font-medium text-white hover:bg-brand-700"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="block rounded-md border border-neutral-300 px-2.5 py-1.5 text-center text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Create an Account
        </Link>
      </div>
    );
  }

  async function onSignOut() {
    await signOut(getClientAuth()).catch(() => undefined);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  const name = displayName?.trim() || username || 'My Account';
  const badge = TIER_BADGE[tier];

  return (
    <div className="space-y-2.5">
      <Link
        href="/dashboard/profile"
        className="-mx-1 flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {name}
          </span>
          {username ? (
            <span className="block truncate text-[11px] text-neutral-500">@{username}</span>
          ) : null}
        </span>
      </Link>

      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
      >
        {badge.label}
      </span>

      <ThemeToggle />

      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Sign out
      </button>
    </div>
  );
}
