'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { toast } from 'sonner';
import { PASSWORD_REQUIREMENTS, validatePassword } from '@sfsr/domain';
import { getClientAuth } from '@sfsr/infrastructure';
import { Checkbox, FormError, SubmitButton, TextField } from '@sfsr/ui';

/**
 * Change password, from the buyer's own profile.
 *
 * ── Why the current password is asked for ────────────────────────────────
 *
 * Firebase refuses `updatePassword` on a session that is not freshly
 * authenticated — it answers `auth/requires-recent-login`. Re-authenticating
 * satisfies that, and it earns something on its own: it proves the person at
 * the keyboard is the account holder and not someone who found an unlocked
 * laptop. A password change that only needs an open tab is not a password.
 *
 * ── Where the rules come from ────────────────────────────────────────────
 *
 * `validatePassword` in @sfsr/domain — the same function the registration form
 * uses. Restating the policy here would let the two drift, and the drift would
 * be silent: a password this form accepts that registration would have
 * refused.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live checklist rather than one error per submit — the policy has five
  // rules, and revealing them one at a time is a miserable way to choose.
  const unmet = useMemo(() => new Set(validatePassword(next).map((v) => v.rule)), [next]);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length > 0 && unmet.size === 0 && !mismatch;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (next === current) {
      setError('Your new password must be different from your current one.');
      return;
    }

    const auth = getClientAuth();
    const user = auth.currentUser;
    if (!user?.email) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Updating your password…');

    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    } catch {
      // Named plainly. This is not account enumeration — the person is already
      // signed in as this account, so "wrong password" reveals nothing they do
      // not know, and a vaguer message would just make them retype a password
      // that was never the problem.
      const message = 'That is not your current password.';
      setError(message);
      toast.error(message, { id: toastId });
      setBusy(false);
      return;
    }

    try {
      await updatePassword(user, next);
      toast.success('Password updated', {
        id: toastId,
        description: 'Use your new password the next time you sign in.',
      });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      const message = 'Could not update your password. Please try again.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 px-5 py-4" noValidate>
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
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = next.length > 0 && !unmet.has(requirement.rule);
            return (
              <li
                key={requirement.rule}
                className={`flex items-center gap-1.5 text-xs ${
                  met ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-400'
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

      <Checkbox
        label="Show passwords"
        checked={show}
        onChange={(e) => setShow(e.target.checked)}
      />

      {error ? <FormError>{error}</FormError> : null}

      <div className="sm:max-w-xs">
        <SubmitButton busy={busy} disabled={busy || !ready}>
          {busy ? 'Updating…' : 'Update password'}
        </SubmitButton>
      </div>
    </form>
  );
}
