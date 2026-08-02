'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';
import { Checkbox, FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Employee sign-in form.
 *
 * RESERVATION.doc specifies a **username**, not an email. For staff the
 * address is deterministic — `<username>@sfsr.internal` — so it is derived
 * here rather than looked up. That deliberately avoids a resolve endpoint
 * whose 200/404 would tell an attacker which usernames exist.
 *
 * The password goes straight from the browser to Firebase; this server never
 * sees it. Only the resulting ID token is posted to /api/auth/session.
 */

const INTERNAL_EMAIL_DOMAIN = 'sfsr.internal';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const email = `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
      const credential = await signInWithEmailAndPassword(getClientAuth(), email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? 'Sign-in failed.');
        return;
      }

      const body = (await response.json()) as { mustChangePassword?: boolean };
      router.push(body.mustChangePassword ? '/change-password' : (params.get('next') ?? '/'));
      router.refresh();
    } catch {
      // One message for "no such user" and "wrong password" alike — a
      // different message for each is a username oracle.
      setError('Incorrect username or password.');
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
        hint="Your SFSR staff username, e.g. jflores"
      />

      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Checkbox
        label="Show password"
        checked={showPassword}
        onChange={(e) => setShowPassword(e.target.checked)}
      />

      {error ? <FormError>{error}</FormError> : null}

      <SubmitButton busy={busy}>{busy ? 'Signing in…' : 'Sign In'}</SubmitButton>
    </form>
  );
}
