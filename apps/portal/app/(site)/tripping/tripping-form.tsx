'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { FormError, SubmitButton, TextField, fieldClass } from '@sfsr/ui';

/**
 * Site viewing request.
 *
 * The date is bounded to the next 90 days and cannot be in the past — a
 * request for a date that has already gone is a wasted round trip for both the
 * buyer and the sales agent who has to phone them about it.
 */
export function TrippingForm({
  projects,
}: {
  projects: ReadonlyArray<{ id: string; name: string; location: string }>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const today = new Date();
  const min = today.toISOString().slice(0, 10);
  const max = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!projectId) {
      setError('Please choose a project.');
      return;
    }
    if (!preferredDate) {
      setError('Please choose a preferred date.');
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Submitting your request…');

    try {
      const response = await fetch('/api/trippings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, preferredDate, preferredTime, notes }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        const message = body.error ?? 'Could not submit your request.';
        setError(message);
        toast.error(message, { id: toastId });
        return;
      }

      toast.success('Site viewing requested', {
        id: toastId,
        description: `We will confirm your ${preferredDate} visit by email.`,
        action: { label: 'Browse units', onClick: () => router.push('/units') },
      });

      setDone(true);
      router.refresh();
    } catch {
      const message = 'Could not submit your request. Please try again.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <p className="text-sm font-medium">Request submitted</p>
        <p className="mt-1.5 text-sm text-neutral-500">
          A sales agent will confirm your schedule. Your request appears below with its status.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setProjectId('');
            setPreferredDate('');
            setNotes('');
          }}
          className="mt-4 text-sm text-brand-600 hover:underline"
        >
          Request another viewing
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="projectId" className="block text-sm font-medium">
          Project<span className="ml-0.5 text-rose-500">*</span>
        </label>
        <select
          id="projectId"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={`${fieldClass} mt-1.5`}
          required
        >
          <option value="">Select a project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} — {project.location}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Preferred date"
          name="preferredDate"
          type="date"
          required
          min={min}
          max={max}
          value={preferredDate}
          onChange={(e) => setPreferredDate(e.target.value)}
          hint="Within the next 90 days"
        />
        <TextField
          label="Preferred time"
          name="preferredTime"
          type="time"
          value={preferredTime}
          onChange={(e) => setPreferredTime(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Unit types you are interested in, number of visitors, or anything else the agent should know."
          className={`${fieldClass} mt-1.5 resize-y`}
        />
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton busy={busy}>{busy ? 'Submitting…' : 'Request Site Viewing'}</SubmitButton>
    </form>
  );
}
