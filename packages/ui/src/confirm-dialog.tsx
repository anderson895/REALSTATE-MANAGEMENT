'use client';

import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from './cn';

/**
 * The one confirmation dialog, shared by both apps.
 *
 * ── Why Radix and not the hand-rolled version this replaces ──────────────
 *
 * The first version was a `<div>` with `role="dialog"`, an Escape listener and
 * a backdrop button. It looked right and was missing the things a dialog is
 * actually for:
 *
 *   - no focus trap, so Tab walked straight out into the page underneath and
 *     a keyboard user could "Cancel" a dialog by activating a link behind it
 *   - no scroll lock, so the record scrolled away under the overlay
 *   - focus never returned to the button that opened it
 *   - the backdrop was a real <button>, which put "Cancel" in the tab order
 *     twice under two different names
 *
 * `@radix-ui/react-dialog` — the primitive shadcn/ui's Dialog is built on —
 * handles all four. The package description has claimed shadcn primitives
 * since the beginning while every component here was hand-written; this is the
 * first one where that mattered enough to be worth the dependency.
 *
 * ── Why it lives here rather than in the Internal app ────────────────────
 *
 * "Are you sure" is the same question in both products, and a second copy is
 * how the buyer portal ends up with a dialog that closes differently from the
 * internal one. `tone` is the only thing that varies: the Portal is deep
 * green, the Internal system navy and gold.
 */

export type ConfirmTone = 'navy' | 'gold' | 'brand' | 'danger';

const TONES: Record<ConfirmTone, string> = {
  navy: 'bg-navy-800 text-white hover:bg-navy-700',
  // Gold carries the single most consequential action on a screen — the
  // supervisor's signature — and takes navy text, because white on #edc16a is
  // barely readable.
  gold: 'bg-gold-400 text-navy-900 hover:bg-gold-300',
  brand: 'bg-brand-600 text-white hover:bg-brand-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function ConfirmDialog({
  trigger,
  title,
  points,
  footnote,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'navy',
  defaultOpen = false,
  onConfirm,
}: {
  /** The control that opens it. Rendered as the trigger, so focus returns here. */
  trigger: ReactNode;
  title: string;
  /**
   * What the person is agreeing to, as separate claims.
   *
   * A list rather than a paragraph on purpose: "are you sure?" is a question
   * nobody reads by the tenth time, and a wall of prose is read even less.
   */
  points?: readonly string[];
  /** Who it will be recorded as, or anything else that follows the points. */
  footnote?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /**
   * Opens on mount.
   *
   * For screenshots and stories — a dialog that only exists after a click is
   * one nobody looks at until it is already in front of a user. Radix has the
   * same prop for the same reason.
   */
  defaultOpen?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl focus:outline-none',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
              >
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </span>

            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold text-navy-800">{title}</Dialog.Title>

              {points && points.length > 0 ? (
                // Described BY the list, so a screen reader announces what is
                // being agreed to rather than just the question.
                <Dialog.Description asChild>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-neutral-600">
                    {points.map((point) => (
                      <li key={point} className="flex gap-1.5">
                        <span aria-hidden="true" className="text-neutral-400">
                          •
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </Dialog.Description>
              ) : null}

              {footnote ? (
                <p className="mt-2.5 text-xs text-neutral-500">{footnote}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className={cn(
                'rounded-md px-3.5 py-2 text-sm font-semibold transition-colors',
                TONES[tone],
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
