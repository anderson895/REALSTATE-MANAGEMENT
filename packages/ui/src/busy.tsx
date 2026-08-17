'use client';

import { cn } from './cn';

/**
 * Waiting, made visible.
 *
 * ── Why both pieces live here ────────────────────────────────────────────
 *
 * `ConfirmDialog` in this package needs the spinner, and both apps need the
 * overlay: signing in, adding a project, removing a unit and uploading a
 * picture are all several seconds of nothing on screen, and several seconds of
 * nothing is indistinguishable from a click that missed.
 */

/**
 * A spinner sized to the text beside it.
 *
 * `currentColor`, so it inherits from whatever it sits in — the same mark reads
 * on a navy button, a white overlay and a rose one without three variants.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
    >
      {/* The faint full ring, so the arc has something to travel around and
          the shape does not read as a broken circle. */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Covers the screen while something is being written.
 *
 * ── Why it blocks, rather than just spinning ─────────────────────────────
 *
 * These overlays sit over CREATE and DELETE. A second click during the wait is
 * a second project, or a delete racing its own refresh — so the point is not
 * only to say "working", it is to make the rest of the screen unclickable
 * while it is true.
 *
 * ── Why it renders nothing when idle ─────────────────────────────────────
 *
 * An always-mounted overlay with `opacity-0` still covers the page and still
 * swallows clicks in some browsers. Absent is absent.
 *
 * ── Accessibility ───────────────────────────────────────────────────────
 *
 * `role="status"` with `aria-live="polite"`, so a screen reader announces the
 * label when it appears instead of leaving the user with a page that has
 * silently stopped responding.
 */
export function BusyOverlay({ show, label = 'Working…' }: { show: boolean; label?: string }) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3.5 shadow-xl">
        <Spinner className="h-5 w-5 text-navy-700" />
        <span className="text-sm font-medium text-navy-800">{label}</span>
      </div>
    </div>
  );
}
