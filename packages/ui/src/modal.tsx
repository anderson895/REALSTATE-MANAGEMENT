'use client';

import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from './cn';

/**
 * A dialog with a FORM in it.
 *
 * ── Why this is separate from ConfirmDialog ───────────────────────────────
 *
 * `ConfirmDialog` asks one question and owns both of its buttons: it renders
 * Cancel and Confirm, and closes itself when either is pressed. That is exactly
 * right for "are you sure?" and exactly wrong for a form — a form's submit has
 * to run, possibly fail validation, and keep the dialog OPEN so the person can
 * see which field is wrong. A confirm dialog that closes on confirm would throw
 * the half-typed record away along with the error message explaining it.
 *
 * So this owns the shell and nothing else. The caller supplies the body and its
 * own buttons, and closes the dialog by calling `onOpenChange(false)` when it
 * decides the work is done.
 *
 * Both are on `@radix-ui/react-dialog` for the reasons written up in
 * ConfirmDialog: focus trapping, scroll locking, and focus returning to the
 * trigger. A form modal needs all three more than a confirmation does — there
 * is far more to tab through.
 *
 * ── Why controlled, with an uncontrolled fallback ─────────────────────────
 *
 * A form usually needs to close ITSELF on success, which the trigger cannot do.
 * Passing `open`/`onOpenChange` hands that to the caller. Omitting both keeps
 * the simple case simple — the modal manages its own state and the trigger is
 * the only way in or out.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  size = 'md',
}: {
  /** The control that opens it. Focus returns here on close. */
  trigger: ReactNode;
  title: string;
  /** One line under the title. Announced by screen readers as the description. */
  description?: string;
  children: ReactNode;
  /** Controlled mode. Supply both, or neither. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `lg` for forms with two columns of fields. */
  size?: 'md' | 'lg';
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isControlled = open !== undefined && onOpenChange !== undefined;

  return (
    <Dialog.Root
      open={isControlled ? open : uncontrolled}
      onOpenChange={isControlled ? onOpenChange : setUncontrolled}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            size === 'lg' ? 'max-w-2xl' : 'max-w-md',
            // A form can outgrow a short screen — a laptop at 768px with the
            // browser chrome is under 600px of usable height. Capped and
            // scrolled INSIDE the dialog, so the footer buttons stay reachable
            // instead of sitting below the fold with no way to get to them.
            'max-h-[calc(100vh-3rem)] overflow-y-auto',
            'rounded-xl border border-neutral-200 bg-white shadow-2xl focus:outline-none',
          )}
        >
          <div className="border-b border-neutral-200/80 px-5 py-4">
            <Dialog.Title className="text-sm font-semibold text-navy-800">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-neutral-500">
                {description}
              </Dialog.Description>
            ) : (
              // Radix warns when Content has no Description. Hidden rather than
              // omitted, so the warning does not train people to ignore console
              // output on a screen that also logs real errors.
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>

          <div className="px-5 py-5">{children}</div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-3.5 top-3.5 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
