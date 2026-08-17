'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@sfsr/ui';
import { deleteProject } from './actions';

/**
 * Removes an empty project.
 *
 * ── Why it only appears on an empty one ──────────────────────────────────
 *
 * The action refuses a project holding any unit, parking slot or reservation —
 * that check is the control and it runs regardless. Hiding the button on the
 * others is so nobody is offered something that will be turned down, and so a
 * button labelled "Remove" never sits next to 30 sold units looking like it
 * would take them with it.
 *
 * A project that has stopped selling is retired through the status of its
 * units, not by deleting it. That is stated in the dialog rather than left for
 * someone to discover by being refused.
 *
 * ── Why the confirmation lists the portal ────────────────────────────────
 *
 * The reason this exists at all is that a mistyped project goes straight to
 * the public site. Whoever is removing one has usually just watched that
 * happen, and the wait is the part they will not expect: the Portal caches the
 * catalogue for ten minutes in a separate process, so the listing outlives the
 * document.
 */
export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove() {
    setError(null);
    const result = await deleteProject(projectId);
    if (!result.ok) {
      setError(result.error);
      // Thrown so ConfirmDialog keeps itself open — it closes on resolve, and
      // a closed dialog would take the explanation with it.
      throw new Error(result.error);
    }
    startTransition(() => {
      // Back to the default project — the one just removed is no longer a
      // valid `?project=`, and staying would render an empty screen.
      router.replace('/inventory');
      router.refresh();
    });
  }

  return (
    <>
      <ConfirmDialog
        tone="danger"
        title={`Remove ${projectName}?`}
        points={[
          'The project is deleted. This cannot be undone.',
          'It has no units, parking slots or reservations — nothing else refers to it.',
          'It can take up to ten minutes to disappear from the public website.',
        ]}
        footnote="Recorded in the audit trail against your account."
        error={error}
        busyLabel="Removing project…"
        confirmLabel="Remove project"
        onConfirm={remove}
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Remove
          </button>
        }
      />
    </>
  );
}
