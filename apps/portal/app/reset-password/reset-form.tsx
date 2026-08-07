'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { OTP_LENGTH, PASSWORD_REQUIREMENTS, validatePassword } from '@sfsr/domain';
import { Checkbox, FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Password reset by emailed one-time code.
 *
 * Replaces Firebase's `sendPasswordResetEmail`, which sent a fixed Google
 * template with no branding and wording nobody here controlled. The code now
 * goes out over Gmail SMTP from a template that looks like the portal.
 *
 * Both steps live on one page rather than behind an emailed link: the person
 * stays where they are, and nothing depends on a URL surviving a mail client
 * that rewrites it.
 *
 * Every message about the ADDRESS stays non-committal — "if that address is
 * registered". The route behind this answers identically for a real and an
 * unknown address, and copy reading "we sent you a code" would hand back
 * exactly what that route works to hide. The original form was careful about
 * this; the flow changed, the care did not.
 */
export function ResetForm() {
  const router = useRouter();
  const [stage, setStage] = useState<'request' | 'verify'>('request');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unmet = useMemo(() => new Set(validatePassword(password).map((v) => v.rule)), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    const toastId = toast.loading('Sending your code…');

    try {
      const response = await fetch('/api/auth/forgot-password', {
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
        description: `If ${email} is registered, a ${OTP_LENGTH}-digit code is on its way.`,
      });
      setStage('verify');
    } catch {
      const message = 'Could not send the code. Please try again.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const toastId = toast.loading('Resetting your password…');

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        const message = body.error ?? 'Could not reset your password.';
        setError(message);
        toast.error(message, { id: toastId });
        return;
      }

      toast.success('Password reset', {
        id: toastId,
        description: 'Sign in with your new password.',
      });
      router.push('/login');
    } catch {
      const message = 'Could not reset your password. Please try again.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'request') {
    return (
      <form onSubmit={requestCode} className="space-y-5" noValidate>
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={`We will send a ${OTP_LENGTH}-digit code to this address.`}
        />

        {error ? <FormError>{error}</FormError> : null}

        <SubmitButton busy={busy}>{busy ? 'Sending…' : 'Send code'}</SubmitButton>

        <p className="text-center text-sm text-neutral-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitNewPassword} className="space-y-5" noValidate>
      <p className="rounded-md bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
        If <strong>{email}</strong> is registered, a {OTP_LENGTH}-digit code is on its way. It
        expires in 10 minutes.
      </p>

      <TextField
        label={`${OTP_LENGTH}-digit code`}
        name="code"
        // `inputMode` rather than type="number": number adds spinners, and it
        // strips a leading zero — which a randomly generated code can start
        // with. `one-time-code` lets iOS and Android offer the code from the
        // notification.
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="tracking-[0.4em]"
      />

      <div>
        <TextField
          label="New password"
          name="newPassword"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = password.length > 0 && !unmet.has(requirement.rule);
            return (
              <li
                key={requirement.rule}
                className={`flex items-center gap-1.5 text-xs ${
                  met ? 'text-brand-600' : 'text-neutral-400'
                }`}
              >
                <span aria-hidden="true">{met ? '✓' : '○'}</span>
                {requirement.label}
              </li>
            );
          })}
        </ul>
      </div>

      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? 'The two passwords do not match.' : undefined}
      />

      <Checkbox label="Show passwords" checked={show} onChange={(e) => setShow(e.target.checked)} />

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton
        busy={busy}
        disabled={busy || code.length !== OTP_LENGTH || unmet.size > 0 || mismatch}
      >
        {busy ? 'Resetting…' : 'Reset password'}
      </SubmitButton>

      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setStage('request');
            setCode('');
            setError(null);
          }}
          className="text-neutral-500 hover:text-neutral-700"
        >
          Use a different email
        </button>
        <button
          type="button"
          onClick={() => void requestCode()}
          disabled={busy}
          className="font-medium text-brand-600 hover:underline disabled:opacity-50"
        >
          Resend code
        </button>
      </div>
    </form>
  );
}
