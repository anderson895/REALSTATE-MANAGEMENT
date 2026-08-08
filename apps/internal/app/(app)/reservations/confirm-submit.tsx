'use client';

import { useRef } from 'react';
import { ConfirmDialog, type ConfirmTone } from '@sfsr/ui';

/**
 * A submit button that asks first.
 *
 * ── Why these steps get a dialog ──────────────────────────────────────────
 *
 * Verifying a payment, verifying an ID, approving a reservation and expiring
 * one are all ATTESTATIONS rather than status changes. Each is written to the
 * record under the name of whoever clicked it, feeds the supervisor's final
 * signature, and has no undo — the state machine has no transition backwards
 * out of any of them. One misplaced click puts a person's name against work
 * they did not do.
 *
 * The dialog names what is being attested to instead of asking "are you
 * sure", and it names the PERSON: seeing your own name in the sentence is what
 * makes the attribution land before the click rather than after it.
 *
 * ── How it submits ───────────────────────────────────────────────────────
 *
 * It does not own the form. The server action stays on the `<form>` in the
 * server component; this only calls `requestSubmit()` on its own form once
 * confirmed, so nothing about the action has to cross the client boundary.
 *
 * `requestSubmit`, not `submit`: the latter skips validation and does not fire
 * the submit event, which would bypass anything else attached to the form.
 */
export function ConfirmSubmit({
  label,
  title,
  points,
  actor,
  tone = 'navy',
  defaultOpen,
}: {
  label: string;
  title: string;
  points: readonly string[];
  /** Who the record will name. */
  actor: string;
  tone?: ConfirmTone;
  /** Screenshot/story aid; never set in the app. */
  defaultOpen?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);

  return (
    <ConfirmDialog
      title={title}
      points={points}
      footnote={
        <>
          Recorded as <span className="font-semibold text-navy-700">{actor}</span>. This cannot be
          undone.
        </>
      }
      confirmLabel={label}
      tone={tone}
      defaultOpen={defaultOpen}
      onConfirm={() => anchor.current?.closest('form')?.requestSubmit()}
      trigger={
        // The span is the handle back to the surrounding form. Radix needs a
        // single element it can attach the trigger props to, and a ref on the
        // button itself would be overwritten by `asChild`.
        <span ref={anchor} className="block">
          <button
            type="button"
            className={`w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              tone === 'gold'
                ? 'bg-gold-400 text-navy-900 hover:bg-gold-300'
                : 'bg-navy-800 text-white hover:bg-navy-700'
            }`}
          >
            {label}
          </button>
        </span>
      }
    />
  );
}
