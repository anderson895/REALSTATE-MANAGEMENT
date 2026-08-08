import { redirect } from 'next/navigation';

/**
 * The forced password change, which now lives on the profile page.
 *
 * ── Why this route still exists at all ────────────────────────────────────
 *
 * `login-form.tsx` sends people here: `router.push(body.mustChangePassword ?
 * '/change-password' : …)`. The page was never written, so that branch led to a
 * 404 — for anyone who reached it.
 *
 * Nobody has. `mustChangePassword` is read off the auth TOKEN, and neither the
 * seed nor User Management sets it as a custom claim; both write it as a field
 * on the `employees` document. The claim is therefore always absent, the branch
 * never fires, and the 404 stayed hidden.
 *
 * ── Why a redirect rather than a second form ─────────────────────────────
 *
 * The form is on /profile, where somebody looking for it would go anyway, and
 * where it sits beside the account it belongs to. Two screens changing a
 * password is two screens to keep in step, and the second one would be reached
 * only by a branch that has never fired.
 *
 * `#password` puts the panel in view on arrival, so a redirect from sign-in
 * lands on the thing it was sent for rather than the top of a profile.
 */
export default function ChangePasswordPage() {
  redirect('/profile#password');
}
