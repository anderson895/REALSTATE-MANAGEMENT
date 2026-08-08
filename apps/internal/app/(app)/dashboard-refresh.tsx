'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { refreshInventoryFigures } from './actions';

/**
 * "Last updated a few seconds ago", and a control that actually updates it.
 *
 * ── Why the age is computed in the browser ───────────────────────────────
 *
 * A server-rendered "12 seconds ago" is wrong the moment it is painted, and the
 * page is cached for sixty seconds, so it would be wrong by up to a minute
 * before anyone read it. The SERVER sends the timestamp; the browser turns it
 * into a phrase and keeps it honest with a ticker.
 *
 * Rendered as an empty placeholder until mounted. `new Date()` on the server
 * and `new Date()` in the browser are different instants, and React would
 * report the mismatch as a hydration error on a page nobody wants noise from.
 *
 * ── Why the button is not just a page reload ─────────────────────────────
 *
 * The figures live in `unstable_cache` with a sixty-second TTL. Reloading the
 * page re-renders it against the SAME cached snapshot and changes nothing,
 * which is the most confusing kind of button. `refreshInventoryFigures`
 * invalidates the tags, so the next render genuinely re-counts.
 */
export function DashboardRefresh({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setLabel(ago(generatedAt));
    tick();
    // Every ten seconds: fine enough that "a few seconds ago" does not sit
    // there for a minute, coarse enough to cost nothing.
    const timer = setInterval(tick, 10_000);
    return () => clearInterval(timer);
  }, [generatedAt]);

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
      <span>{label ? `Last updated ${label}` : ''}</span>
      <button
        type="button"
        aria-label="Refresh inventory figures"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await refreshInventoryFigures();
            router.refresh();
          })
        }
        className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-navy-700 disabled:opacity-50"
      >
        <RotateCw
          className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/** Coarse on purpose — nobody needs "47 seconds ago" to the second. */
function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'a few seconds ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
