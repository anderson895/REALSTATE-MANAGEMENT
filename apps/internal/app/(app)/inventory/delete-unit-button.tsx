'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@sfsr/ui';
import { deleteUnit } from './actions';

/**
 * Removes a unit that nothing refers to.
 *
 * ── Why it only appears on an Available one ──────────────────────────────
 *
 * The action refuses anything else and re-reads the status to do it — that is
 * the control, and it runs whether or not this button was drawn. Hiding it on
 * the others is so a control labelled "Remove" never sits in the same row as
 * the word "Sold", where it reads as an offer to undo a sale.
 *
 * A unit with a reservation behind it is refused too, even when its status has
 * gone back to Available — a cancelled reservation still names the unit. The
 * button cannot know that without a query per row, so that one surfaces as a
 * refusal rather than a hidden button, with the reason spelled out.
 */
export function DeleteUnitButton({
  unitId,
  unitNo,
}: {
  unitId: string;
  unitNo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove() {
    setError(null);
    const result = await deleteUnit(unitId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <>
      <ConfirmDialog
        tone="danger"
        title={`Remove unit ${unitNo}?`}
        points={[
          'The unit is deleted. This cannot be undone.',
          'It is Available and has never been reserved, so nothing else refers to it.',
          'It can take up to ten minutes to disappear from the public website.',
        ]}
        footnote="Recorded in the audit trail against your account."
        confirmLabel="Remove unit"
        onConfirm={remove}
        trigger={
          <button
            type="button"
            aria-label={`Remove unit ${unitNo}`}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Remove
          </button>
        }
      />
      {error ? <p className="mt-1 max-w-xs text-[11px] text-rose-600">{error}</p> : null}
    </>
  );
}
