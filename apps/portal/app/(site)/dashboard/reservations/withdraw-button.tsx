'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Money } from '@sfsr/domain';

/**
 * Asks to withdraw a reservation.
 *
 * Two presses, not one. The first only opens the panel; the money sentence
 * sits between them, because RESERVATION.doc clause 4 forfeits the ₱50,000
 * reservation fee and a single mis-click should not be able to reach that.
 *
 * The copy says "request" throughout, and it is not a euphemism: clause 5 says
 * withdrawal "may result in cancellation in accordance with company policy",
 * and that policy — Development Plan.md §8.4 — puts the decision with staff
 * under management approval. Calling the button "Cancel reservation" would
 * promise an outcome this cannot deliver.
 */
export function WithdrawButton({
  reservationNumber,
  reservationFeeCentavos,
}: {
  reservationNumber: string;
  reservationFeeCentavos: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const toastId = toast.loading('Recording your request…');

    try {
      const response = await fetch('/api/reservations/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationNumber, reason }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        toast.error(body.error ?? 'Could not record your request.', { id: toastId });
        return;
      }

      toast.success('Withdrawal requested', {
        id: toastId,
        description: `Our team will contact you about ${reservationNumber}.`,
      });
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Could not record your request. Please try again.', { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
      >
        Request withdrawal
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-md border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">
        Request to withdraw {reservationNumber}?
      </p>
      <p className="mt-1.5 text-sm text-amber-800">
        Your {Money.fromCentavos(reservationFeeCentavos).format()} reservation fee is{' '}
        <strong>non-refundable and non-transferable</strong>. Withdrawing does not cancel the
        reservation by itself — our team reviews every request before anything is finalised, and
        will contact you.
      </p>

      <label className="mt-3 block text-xs font-medium text-amber-900">
        Reason <span className="font-normal">(optional)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
          placeholder="Anything you would like the team to know."
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800 disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          Keep my reservation
        </button>
      </div>
    </div>
  );
}
