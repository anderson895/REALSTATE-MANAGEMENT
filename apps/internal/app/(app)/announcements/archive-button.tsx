'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@sfsr/ui';
import { archiveAnnouncement } from './actions';

/**
 * Take one announcement down.
 *
 * Behind a confirmation because the list is a wall of posts and the button sits
 * on every row — a misclick on the wrong one is easy, and un-archiving is not
 * offered. The dialog names the post so the confirmation is about a specific
 * thing rather than about the abstraction.
 */
export function ArchiveButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await archiveAnnouncement(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 text-right">
      <ConfirmDialog
        title="Take this announcement down?"
        points={[
          `"${title}" stops being listed as published.`,
          'It is archived, not deleted — the post and who put it up stay on this screen, greyed out.',
          'There is no undo from here.',
        ]}
        confirmLabel={pending ? 'Archiving…' : 'Archive it'}
        tone="danger"
        onConfirm={run}
        trigger={
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
          >
            Archive
          </button>
        }
      />
      {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
