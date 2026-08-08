import { isOfLegalAge, validateUsername } from '@sfsr/domain';

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
 *
 * `generateTemporaryPassword` and `suggestUsername` used to live here. They now
 * sit in `lib/credentials.ts`, because User Management opens accounts for other
 * people too and the two screens must mint credentials the same way.
 */

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
