'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';

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

  const field =
    'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-800';

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div>
        <label htmlFor="username" className="block text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          className="rounded border-neutral-300"
        />
        Show password
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
