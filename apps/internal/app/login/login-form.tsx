'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';
import { Checkbox, FormError, TextField } from '@sfsr/ui';
import { EyeToggle, Icon } from './icons';

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

/** Navy focus ring, because this card is not on the app's green chrome. */
const FIELD_ON_LIGHT =
  'border-neutral-300 bg-white text-neutral-900 focus:border-[#1b3a6b] focus:ring-2 focus:ring-[#1b3a6b]/20 dark:border-neutral-300 dark:bg-white dark:text-neutral-900';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
        body: JSON.stringify({ idToken, remember }),
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
    <form onSubmit={onSubmit} className="space-y-3.5">
      {/* Both fields are required, so the asterisk marks nothing out. */}
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoFocus
        required
        showRequiredMarker={false}
        placeholder="Enter your username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        leading={<Icon name="user" className="h-[17px] w-auto opacity-90" />}
        className={FIELD_ON_LIGHT}
      />

      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        required
        showRequiredMarker={false}
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leading={<Icon name="key" className="h-[17px] w-auto opacity-90" />}
        className={FIELD_ON_LIGHT}
        inlineAction={
          <button
            type="button"
            onClick={() => setShowPassword((on) => !on)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="rounded p-1.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#1b3a6b]/30"
          >
            <EyeToggle struck={showPassword} />
          </button>
        }
      />

      <div className="space-y-2 pt-1">
        <Checkbox
          label="Show Password"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          className="accent-[#1b3a6b]"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox
            label="Remember Me"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-[#1b3a6b]"
          />
          <button
            type="button"
            onClick={() => setShowHelp((on) => !on)}
            aria-expanded={showHelp}
            className="text-sm text-[#2563a8] underline-offset-2 hover:underline"
          >
            Forgot Password?
          </button>
        </div>

        {/* Small, because it restates the checkbox rather than adding to it —
            but present, because the default changed and staff who expect to
            stay signed in should find out here rather than tomorrow morning. */}
        <p className="text-[11px] text-neutral-400">
          {remember
            ? 'This browser stays signed in for 5 days.'
            : 'You are signed out when this browser closes.'}
        </p>
      </div>

      {/*
       * No self-service reset, and no link to one. RESERVATION.doc and
       * INTERNAL.xls both put password maintenance with I.T — "Maintenance of
       * user profile is c/o I.T" — so the honest answer to "forgot password"
       * is who to ask, not a form that does not exist.
       */}
      {showHelp ? (
        <div className="rounded-md border border-[#1b3a6b]/20 bg-[#1b3a6b]/5 px-4 py-3 text-sm text-neutral-700">
          <p className="font-medium text-[#12294f]">Passwords are reset by I.T.</p>
          <p className="mt-1 text-xs leading-relaxed">
            There is no self-service reset for staff accounts. Contact the IT Department to have
            your password reissued — you will be asked to change it at first sign-in.
          </p>
        </div>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-[#12294f] px-4 py-3 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-[#1b3a6b] focus:outline-none focus:ring-2 focus:ring-[#c9a227]/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        {busy ? 'SIGNING IN…' : 'SIGN IN'}
      </button>

      <p className="flex items-center justify-center gap-2 text-xs text-neutral-500">
        <Icon name="headset" className="h-[15px] w-auto opacity-80" />
        Contact your IT Administrator.
      </p>
    </form>
  );
}
