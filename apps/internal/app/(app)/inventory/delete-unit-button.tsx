'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog, Modal, cn } from '@sfsr/ui';
import { deleteUnit } from './actions';

/**
 * Removes a unit that nothing refers to.
 *
 * ── Why the button is drawn even when it cannot act ──────────────────────
 *
 * It used to be omitted on anything not Available, which left the column
 * ragged — a control on most rows and a gap on the two that were Sold. A gap
 * reads as something failing to render, and the eye has to work out which rows
 * are missing a button and why.
 *
 * So it is always there, and on a unit that cannot go it is muted, marked
 * `aria-disabled`, and explains itself when pressed. That keeps the original
 * concern intact — a live red "Remove" beside the word "Sold" reads as an
 * offer to undo a sale — while the grid stays a grid.
 *
 * Not a real `disabled` attribute: a disabled button fires no click, so there
 * would be nothing to hang the explanation on, and a control that does
 * nothing whatever when pressed teaches people the screen is broken.
 *
 * ── What the button cannot know ──────────────────────────────────────────
 *
 * Whether the unit has a reservation behind it. That is one query per row, so
 * status is what the screen goes on. A unit that is Available but was once
 * reserved still looks removable here and is refused by the action, with the
 * reason shown in the dialog — which is the right way round: the check that
 * matters runs on the server either way.
 */
export function DeleteUnitButton({
  unitId,
  unitNo,
  /** Set when the unit cannot be removed, and says why. */
  blockedReason,
}: {
  unitId: string;
  unitNo: string;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const label = (
    <>
      <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      Remove
    </>
  );

  const buttonClass = (blocked: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
      blocked
        ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
        : 'border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700',
    );

  if (blockedReason) {
    return (
      <Modal
        title={`Unit ${unitNo} cannot be removed`}
        trigger={
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Remove unit ${unitNo} — not available`}
            className={buttonClass(true)}
          >
            {label}
          </button>
        }
      >
        <p className="text-sm leading-relaxed text-neutral-600">{blockedReason}</p>
      </Modal>
    );
  }

  async function remove() {
    setError(null);
    const result = await deleteUnit(unitId);
    if (!result.ok) {
      setError(result.error);
      // Thrown so ConfirmDialog keeps itself open — it closes on resolve, and
      // a closed dialog would take the explanation with it.
      throw new Error(result.error);
    }
    startTransition(() => router.refresh());
  }

  return (
    <ConfirmDialog
      tone="danger"
      title={`Remove unit ${unitNo}?`}
      points={[
        'The unit is deleted. This cannot be undone.',
        'It is Available, so nothing has been sold against it.',
        'It can take up to ten minutes to disappear from the public website.',
      ]}
      footnote="Recorded in the audit trail against your account."
      error={error}
      busyLabel="Removing unit…"
      confirmLabel="Remove unit"
      onConfirm={remove}
      trigger={
        <button type="button" aria-label={`Remove unit ${unitNo}`} className={buttonClass(false)}>
          {label}
        </button>
      }
    />
  );
}
