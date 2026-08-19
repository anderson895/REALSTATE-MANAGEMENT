'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { toast } from 'sonner';
import { getClientAuth } from '@sfsr/infrastructure';
import { Checkbox, FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Buyer sign-in.
 *
 * Two steps because RESERVATION.doc specifies a username but Firebase needs an
 * email: resolve the username server-side against the private index, then sign
 * in from the browser so the password never touches this server.
 *
 * The resolve endpoint answers 200 even for unknown usernames (see its own
 * comment), so a wrong username and a wrong password fail identically here.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    // One toast for the whole attempt: raised as a spinner here, then replaced
    // in place by passing the same `id`. Raising a second toast on success
    // would leave the "Signing you in…" spinner stacked above it, still
    // spinning, describing something that already finished.
    const toastId = toast.loading('Signing you in…');

    try {
      const resolved = await fetch('/api/auth/resolve-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const { email } = (await resolved.json()) as { email: string };

      const credential = await signInWithEmailAndPassword(getClientAuth(), email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        const message = body.error ?? 'Sign-in failed. Please try again.';
        setError(message);
        toast.error(message, { id: toastId });
        return;
      }

      // `displayName` is on the token already, so greeting them by name costs
      // no extra request.
      const name = credential.user.displayName?.split(' ')[0];

      const next = params.get('next');
      toast.success(name ? `Welcome back, ${name}!` : 'Signed in', {
        id: toastId,
        description: `Signed in as @${username}`,
        // Only offered when the sign-in is sending them somewhere ELSE — a
        // deep link they were bounced off. Landing on My Reservations and
        // being offered a button to My Reservations is furniture.
        action: next
          ? { label: 'My Reservations', onClick: () => router.push('/dashboard/reservations') }
          : undefined,
      });

      router.push(next ?? '/dashboard/reservations');
      router.refresh();
    } catch {
      const message = 'Incorrect username or password.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoFocus
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        trailing={
          /*
           * Sits on the USERNAME field, mirroring "Forgot password?" below.
           *
           * comments.doc asked for username recovery alongside the password
           * one, and this is the field where the person is stuck. Putting the
           * link anywhere else would leave them to work out that the reset
           * flow — which only changes a password — was never going to help.
           */
          <Link href="/forgot-username" className="text-xs text-brand-600 hover:underline">
            Forgot username?
          </Link>
        }
      />

      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        trailing={
          <Link href="/reset-password" className="text-xs text-brand-600 hover:underline">
            Forgot password?
          </Link>
        }
      />

      <div className="flex items-center justify-between">
        <Checkbox
          label="Show password"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
        <Checkbox
          label="Remember me"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton busy={busy}>{busy ? 'Signing in…' : 'Sign In'}</SubmitButton>
    </form>
  );
}
