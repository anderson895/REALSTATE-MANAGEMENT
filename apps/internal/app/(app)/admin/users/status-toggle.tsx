'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@sfsr/ui';
import { setEmployeeStatus } from './actions';

/**
 * Deactivate an account, or bring it back.
 *
 * ── Why deactivating is behind a confirmation and reactivating is not ────
 *
 * They are not symmetrical. Deactivating ends somebody's access mid-shift —
 * their open session dies on its next request — and the person it happens to is
 * not the person clicking. Reactivating restores a state that already existed
 * and can be undone by the button beside it.
 *
 * The dialog names what actually stops the sign-in, because "deactivate" reads
 * like a flag on a record, and it is not: the Firebase Auth user is disabled
 * and its refresh tokens are revoked. Somebody deciding whether to click needs
 * to know it takes effect now rather than at the end of the day.
 */
export function StatusToggle({
  employeeId,
  fullName,
  status,
}: {
  employeeId: string;
  fullName: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = status === 'Active';

  function run(next: 'Active' | 'Inactive') {
    startTransition(async () => {
      const result = await setEmployeeStatus(employeeId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  if (!active) {
    return (
      <div className="text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() => run('Active')}
          className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Reactivate'}
        </button>
        {error ? <p className="mt-1 max-w-xs text-[11px] text-rose-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="text-right">
      <ConfirmDialog
        title={`Deactivate ${fullName}?`}
        points={[
          'Their Firebase Auth user is disabled, so the login screen refuses them.',
          'Their refresh tokens are revoked — a session open right now stops working on its next request, rather than in up to five days.',
          'The employee record and the username stay. Every reservation they verified keeps showing their name, and nobody else can be given their username.',
          'Reversible from this same row.',
        ]}
        confirmLabel={pending ? 'Deactivating…' : 'Deactivate'}
        tone="danger"
        onConfirm={() => run('Inactive')}
        trigger={
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
          >
            Deactivate
          </button>
        }
      />
      {error ? <p className="mt-1 max-w-xs text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
