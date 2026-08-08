'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Check, KeyRound } from 'lucide-react';
import { PASSWORD_REQUIREMENTS, validatePassword } from '@sfsr/domain';
import { getClientAuth } from '@sfsr/infrastructure';
import { Checkbox, FormError, TextField } from '@sfsr/ui';
import { markPasswordChanged } from './actions';

/**
 * Change your own password, from the internal profile page.
 *
 * ── Why the password never reaches this server ───────────────────────────
 *
 * The same arrangement the sign-in screen uses: the browser talks to Firebase
 * directly with the client SDK, and the server only ever sees the resulting
 * token. A server action taking a plaintext password would put it in a request
 * body, in a server log on a machine sitting in an office, and in the memory of
 * a process that has no need of it.
 *
 * ── Why the current password is asked for ────────────────────────────────
 *
 * Firebase refuses `updatePassword` on a session that is not freshly
 * authenticated — it answers `auth/requires-recent-login`. Re-authenticating
 * satisfies that, and earns something on its own: it proves the person at the
 * keyboard is the account holder. These are SHARED office workstations
 * (Development Plan.md §5.7), so "an open tab" is a much weaker claim here than
 * it would be on a buyer's own laptop.
 *
 * ── The part the Portal's version does not have to do ────────────────────
 *
 * Changing a password moves the account's `tokensValidAfterTime`, and this app
 * verifies its session cookie with `checkRevoked: true`. So the cookie minted
 * at sign-in is dead the instant the password changes, and the next navigation
 * would bounce the person to /login having just proved who they are. Posting a
 * fresh ID token to /api/auth/session re-mints it — the same exchange the login
 * form performs, for the same reason.
 */
export function ChangePassword({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Live checklist rather than one error per submit — the policy has five
  // rules, and revealing them one at a time is a miserable way to choose.
  const unmet = useMemo(() => new Set(validatePassword(next).map((v) => v.rule)), [next]);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length > 0 && unmet.size === 0 && !mismatch;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next === current) {
      setError('Your new password must be different from your current one.');
      return;
    }

    const auth = getClientAuth();
    const user = auth.currentUser;
    if (!user?.email) {
      /*
       * The client SDK holds its own sign-in state, separate from the httpOnly
       * cookie this app navigates with. Closing the tab and returning on a live
       * cookie leaves the cookie valid and `currentUser` null — so this is a
       * normal situation, not a broken one, and it says what to do about it.
       */
      setError('Sign in again before changing your password — this tab has lost its Firebase session.');
      return;
    }

    setBusy(true);
    try {
      try {
        await reauthenticateWithCredential(
          user,
          // Employees have no real address; Firebase Auth needs one, so it is
          // synthesised from the username as `{username}@sfsr.internal`. That
          // is what `user.email` holds, and it is what signs them in.
          EmailAuthProvider.credential(user.email, current),
        );
      } catch {
        // Named plainly. Not account enumeration — they are already signed in
        // as this account, so "wrong password" tells them nothing they do not
        // know, and a vaguer message makes them retype a field that was fine.
        setError('That is not your current password.');
        return;
      }

      await updatePassword(user, next);

      /*
       * Re-mint the cookie BEFORE clearing the flag.
       *
       * The old session cookie is already invalid at this point, so the server
       * action below would be refused by `requireEmployee()` if this were left
       * until afterwards. Ordering is the whole of it.
       */
      const idToken = await user.getIdToken(true);
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      await markPasswordChanged();

      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      // The profile page prints the "still the seeded password" warning off the
      // employee record, which the action just changed.
      router.refresh();
    } catch {
      setError('Could not update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mustChange && !done ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span>
            Your password is still the one issued when the account was created. Change it here —
            it does not need IT.
          </span>
        </p>
      ) : null}

      {done ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <span>
            Password updated. Use the new one the next time you sign in — you are still signed in
            here.
          </span>
        </p>
      ) : null}

      <TextField
        label="Current password"
        name="currentPassword"
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />

      <div>
        <TextField
          label="New password"
          name="newPassword"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        {/* The same five rules `validatePassword` holds a buyer to on the
            registration page. Restating them here would let the two drift, and
            the drift would be silent. */}
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = next.length > 0 && !unmet.has(requirement.rule);
            return (
              <li
                key={requirement.rule}
                className={`flex items-center gap-1.5 text-xs ${
                  met ? 'text-emerald-600' : 'text-neutral-400'
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

      <button
        type="submit"
        disabled={busy || !ready}
        className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
