'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import { getClientAuth } from '@sfsr/infrastructure';
import { ThemeToggleCompact } from '@sfsr/ui';
import type { ClientTier } from '@sfsr/domain';

/**
 * Who is signed in, in the top-right of every portal page.
 *
 * This used to sit at the foot of the sidebar. It moved up here to match the
 * reference design the client supplied with the sidebar request, which puts
 * the account chip in the header and gives the sidebar's foot to the company
 * tagline.
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

export function AccountBar({
  tier,
  displayName,
  username,
}: {
  /**
   * Signed-in tiers only. A guest never reaches this component — the layout
   * hands them `PublicShell`, which has its own Register / Login button — and
   * saying so in the type is what keeps a dead "browsing as guest" branch from
   * living on here, quietly rotting, unreachable.
   */
  tier: Exclude<ClientTier, 'GUEST'>;
  displayName?: string;
  username?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A menu that only closes via its own items is a menu users get stuck in.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function onSignOut() {
    const toastId = toast.loading('Signing you out…');
    await signOut(getClientAuth()).catch(() => undefined);
    await fetch('/api/auth/session', { method: 'DELETE' });

    toast.success('Signed out', {
      id: toastId,
      description: 'Your session on this device has ended.',
      action: { label: 'Sign back in', onClick: () => router.push('/login') },
    });

    router.push('/');
    router.refresh();
  }

  const name = displayName?.trim() || username || 'My Account';
  const badge = TIER_BADGE[tier];

  return (
    // No vertical padding: the shell fixes the bar's height so it lines up
    // with the sidebar's brand plate, and padding here would fight that.
    <div className="flex h-full w-full items-center justify-end gap-2 md:px-5">
      <ThemeToggleCompact />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
          >
            {initialsOf(name)}
          </span>
          {/* Below `sm` only the avatar shows: the mobile header already
              carries the company name, and the dropdown repeats @username and
              the tier the moment it opens. */}
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {name}
            </span>
            {/* Plain text, not the pill: two filled chips side by side in a
                header — avatar and badge — read as a control each. The pill
                itself lives in the dropdown, where it has room. */}
            <span className="block truncate text-[10px] text-neutral-500">{badge.label}</span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-neutral-400"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
              {username ? (
                <p className="truncate text-[11px] text-neutral-500">@{username}</p>
              ) : null}
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            <Link
              href="/dashboard/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              My Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onSignOut();
              }}
              className="block w-full border-t border-neutral-200 px-4 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50 dark:border-neutral-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
