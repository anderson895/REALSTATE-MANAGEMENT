import { randomInt } from 'node:crypto';
import { PASSWORD_POLICY, isOfLegalAge, validateUsername } from '@sfsr/domain';

/**
 * Walk-in reservations — the buyer side.
 *
 * note.txt: "Add walking reservation on internal same process sa web portal."
 *
 * ── Why a buyer has to have an ACCOUNT ────────────────────────────────────
 *
 * `ReservationWorkflowService.submit` takes a `ClientId`, and everything
 * downstream hangs off it: the payment record, the uploaded documents, the
 * statement of account, and eventually the Permanent Client Account. A walk-in
 * with no account would produce a reservation nothing else could attach to,
 * and a buyer who can never see their own purchase.
 *
 * So the counter flow resolves a buyer first: search for an existing account —
 * they may well have registered on the Portal already — and only create one if
 * there is genuinely nobody there. Creating a second account for someone who
 * already has one splits their history in half.
 */

/** Characters a temporary password is drawn from, one class at a time. */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?';

/**
 * A temporary password for a counter-created account.
 *
 * ── Why it is generated and not typed by the staff member ────────────────
 *
 * The buyer is standing there. A staff member inventing a password on the spot
 * types something they can say out loud, which across a day of walk-ins means
 * the same handful of passwords on every account they open.
 *
 * `randomInt` from node:crypto, not `Math.random` — this is a credential, and
 * `Math.random` is seeded predictably enough that a sequence of them can be
 * reconstructed. Ambiguous glyphs (O/0, I/l/1) are left out of the alphabets
 * because this gets read aloud or copied off a screen.
 *
 * Satisfies PASSWORD_POLICY by construction: one character of each required
 * class first, then filled and shuffled, so it cannot fail the very rule the
 * Portal will hold the buyer to when they change it.
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
 * A username suggestion, so the counter is not blocked on inventing one.
 *
 * First initial plus surname, stripped to what USERNAME_POLICY allows, padded
 * if the result is too short. Only a SUGGESTION — the caller must still check
 * it is free and let the staff member override it.
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

export interface WalkInBuyerInput {
  readonly firstName: string;
  readonly middleName: string;
  readonly lastName: string;
  readonly suffix: string;
  readonly dateOfBirth: string;
  readonly sex: string;
  readonly mobile: string;
  readonly email: string;
  readonly username: string;
}

/**
 * Everything wrong with a counter-entered buyer, in one pass.
 *
 * Returned as a map keyed by field so the form can put each message where it
 * belongs, rather than stopping at the first problem and making the staff
 * member discover the rest one submission at a time.
 */
export function validateWalkInBuyer(input: WalkInBuyerInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.firstName.trim()) errors.firstName = 'First name is required.';
  if (!input.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!input.sex.trim()) errors.sex = 'Sex is required.';
  if (!input.mobile.trim()) errors.mobile = 'Mobile number is required.';

  if (!input.email.trim()) {
    errors.email = 'Email is required — the account cannot be created without one.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  const usernameProblems = validateUsername(input.username);
  if (usernameProblems.length > 0) errors.username = usernameProblems[0]!.message;

  if (!input.dateOfBirth.trim()) {
    errors.dateOfBirth = 'Date of birth is required.';
  } else {
    const born = new Date(input.dateOfBirth);
    if (Number.isNaN(born.getTime())) {
      errors.dateOfBirth = 'Enter a valid date.';
    } else if (!isOfLegalAge(born, new Date())) {
      // The same 21 the Portal holds a self-registering buyer to. A counter is
      // not a way around it.
      errors.dateOfBirth = 'Buyer must be at least 21 years old.';
    }
  }

  return errors;
}
