'use client';

import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { toast } from 'sonner';
import { getClientAuth } from '@sfsr/infrastructure';
import { FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Password reset request.
 *
 * Always reports success, whether or not the address is registered. A message
 * that distinguishes the two turns this form into a free "is this person a
 * customer of St. Francis Square Realty?" oracle — which is itself personal
 * information under RA 10173, and the same reasoning behind the
 * anti-enumeration behaviour in /api/auth/resolve-username.
 *
 * Firebase sends the email; no server route is needed.
 */
export function ResetForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const toastId = toast.loading('Sending your reset link…');

    try {
      await sendPasswordResetEmail(getClientAuth(), email.trim().toLowerCase());
    } catch (caught) {
      const code = (caught as { code?: string }).code;
      // auth/user-not-found is swallowed on purpose — see the note above.
      // Anything else is a real fault worth surfacing.
      if (code && code !== 'auth/user-not-found' && code !== 'auth/invalid-email') {
        const message = 'Could not send the reset email. Please try again.';
        setError(message);
        toast.error(message, { id: toastId });
        setBusy(false);
        return;
      }
    }

    // Deliberately the same message whether or not the address is registered —
    // the toast must not become the account-enumeration oracle the inline copy
    // was carefully written to avoid.
    toast.success('Check your email', {
      id: toastId,
      description: `If ${email.trim().toLowerCase()} is registered, a reset link is on its way.`,
    });

    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-medium">Check your inbox</p>
        <p className="mt-1.5 text-sm text-neutral-500">
          If an account exists for <span className="font-medium">{email}</span>, a password reset
          link is on its way. The link expires in one hour.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
          className="mt-4 text-sm text-brand-600 hover:underline"
        >
          Use a different email address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <TextField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="The address you registered with, not your username."
      />

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton busy={busy}>{busy ? 'Sending…' : 'Send Reset Link'}</SubmitButton>
    </form>
  );
}
