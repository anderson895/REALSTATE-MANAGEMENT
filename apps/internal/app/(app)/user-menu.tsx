'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';

/**
 * The account block on the right of the topbar.
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws it as avatar, name, role and a
 * chevron — so there is a menu behind it. The employee ID and the Approver
 * badge live in that menu rather than on the bar itself: they are things you
 * look up when you need them, not things you read every time you glance at the
 * top of the screen, and the sheet's bar carries neither.
 *
 * ── Why a client component and not <details> ──────────────────────────────
 *
 * The sidebar's disclosures are `<details>` because they cost no JavaScript
 * and nothing bad happens if one stays open. A menu floating over the page is
 * different: it has to close when you click away or press Escape, and
 * `<details>` does neither. This file is already a client boundary because
 * signing out calls the Firebase SDK, so the state costs nothing extra.
 */
export function UserMenu({
  name,
  role,
  initials,
  employeeId,
  isSupervisor,
}: {
  name: string;
  role: string;
  initials: string;
  employeeId: string;
  isSupervisor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
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

  async function signOutNow() {
    // Clear both sides: the Firebase client session and our httpOnly cookie.
    await signOut(getClientAuth()).catch(() => undefined);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-navy-50"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white"
        >
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-[13px] font-semibold leading-tight text-navy-800">
            {name}
          </span>
          <span className="block truncate text-[11px] leading-tight text-navy-500">{role}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-navy-500 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-56 rounded-lg border border-neutral-200 bg-white py-1.5 shadow-lg"
        >
          <div className="border-b border-neutral-100 px-3.5 pb-2.5 pt-1.5">
            <p className="truncate text-[13px] font-semibold text-navy-800">{name}</p>
            <p className="truncate text-[11px] text-navy-500">{role}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold text-navy-700">
                {employeeId}
              </span>
              {isSupervisor ? (
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-900">
                  Approver
                </span>
              ) : null}
            </div>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <UserRound className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            My profile
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={signOutNow}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
