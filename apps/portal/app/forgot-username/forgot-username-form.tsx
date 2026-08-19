'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Ask for the address; the username goes to the mailbox, never to the screen.
 *
 * ── Why the confirmation is worded so carefully ──────────────────────────
 *
 * "If that address is registered" — not "we have sent you your username". The
 * route behind this answers identically for a real address and an unknown one,
 * and copy that promised delivery would hand back the very thing the route
 * works to hide: whether this person banks with St. Francis Square Realty.
 * The password reset form makes the same distinction; this one inherits it
 * because the information at stake is the same.
 *
 * Nothing on this page ever displays a username. A form that printed one back
 * would be a free lookup for anybody with a list of email addresses.
 */
export function ForgotUsernameForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const toastId = toast.loading('Looking for your account…');

    try {
      const response = await fetch('/api/auth/forgot-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok) {
        const message = body.error ?? 'Enter a valid email address.';
        setError(message);
        toast.error(message, { id: toastId });
        return;
      }

      toast.success('Check your email', {
        id: toastId,
        description: `If ${email} is registered, your username is on its way.`,
      });
      setSent(true);
    } catch {
      const message = 'Could not send it just now. Please try again.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3.5">
          <p className="text-sm font-medium text-brand-800">Check your email</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            If <span className="font-medium">{email}</span> is registered with us, your username is
            on its way. It can take a minute or two to arrive — please check your spam folder as
            well.
          </p>
        </div>

        {/*
         * The next step, spelled out. Someone who has forgotten their username
         * has a fair chance of not being sure about the password either, and
         * the reset flow needs the username to be of any use — so the order
         * matters and is worth saying rather than leaving them to discover it.
         */}
        <p className="text-sm leading-relaxed text-neutral-500">
          Once you have it, <Link href="/login" className="font-medium text-brand-600 hover:underline">sign in</Link>
          {' '}— or use{' '}
          <Link href="/reset-password" className="font-medium text-brand-600 hover:underline">
            Forgot password
          </Link>{' '}
          if you need that reset too.
        </p>

        <button
          type="button"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="text-sm text-neutral-500 underline-offset-2 hover:underline"
        >
          Use a different email address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="The address you registered with."
      />

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton busy={busy}>{busy ? 'Sending…' : 'Send my username'}</SubmitButton>

      <p className="text-sm text-neutral-500">
        Forgotten your password instead?{' '}
        <Link href="/reset-password" className="font-medium text-brand-600 hover:underline">
          Reset it here
        </Link>
        .
      </p>
    </form>
  );
}
