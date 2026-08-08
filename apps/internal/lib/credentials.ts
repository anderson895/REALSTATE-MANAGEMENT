import { randomInt } from 'node:crypto';
import { PASSWORD_POLICY } from '@sfsr/domain';

/**
 * How this system mints a credential for somebody else.
 *
 * Two screens do it: the walk-in counter opening an Initial Account for a buyer
 * standing there, and User Management opening an internal account for a new
 * employee. Both hand a password to a person who did not choose it, and both
 * then require it to be changed on first sign-in.
 *
 * They live here rather than in either screen because the rule they encode is
 * one rule. A second copy beside the second caller is how "the counter's
 * passwords are strong and the admin's are not" happens.
 */

/** Characters a temporary password is drawn from, one class at a time. */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?';

/**
 * A temporary password for an account somebody else opened.
 *
 * ── Why it is generated and not typed by the staff member ────────────────
 *
 * The other person is standing there. A staff member inventing a password on
 * the spot types something they can say out loud, which across a day of
 * walk-ins — or an afternoon of onboarding — means the same handful of
 * passwords on every account they open.
 *
 * `randomInt` from node:crypto, not `Math.random` — this is a credential, and
 * `Math.random` is seeded predictably enough that a sequence of them can be
 * reconstructed. Ambiguous glyphs (O/0, I/l/1) are left out of the alphabets
 * because this gets read aloud or copied off a screen.
 *
 * Satisfies PASSWORD_POLICY by construction: one character of each required
 * class first, then filled and shuffled, so it cannot fail the very rule the
 * holder will be held to when they change it.
 */
export function generateTemporaryPassword(length = 12): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const pick = (set: string) => set[randomInt(set.length)]!;

  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < Math.max(length, PASSWORD_POLICY.minLength)) {
    chars.push(pick(all));
  }

  // Fisher-Yates, so the four guaranteed classes are not always in positions
  // 0-3 — a predictable shape is a smaller keyspace.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/**
 * A username suggestion, so whoever is at the keyboard is not blocked on
 * inventing one.
 *
 * First initial plus surname, stripped to what USERNAME_POLICY allows, padded
 * if the result is too short. Only a SUGGESTION — the caller must still check
 * it is free and let the staff member override it.
 *
 * This is also the shape RBAC.xls already uses for the seeded employees —
 * `jflores`, `cfernandez`, `mtan` — so an account opened here is
 * indistinguishable from one that came out of the workbook.
 */
export function suggestUsername(firstName: string, lastName: string): string {
  const initial = firstName.trim().slice(0, 1);
  const base = `${initial}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (base.length === 0) return '';

  // Pad rather than reject: "J Yu" is a real name and produces "jyu".
  let candidate = base;
  while (candidate.length < 6) candidate += randomInt(10).toString();
  return candidate.slice(0, 20);
}
