import { z } from 'zod';
import { SEX_OPTIONS, isOfLegalAge, MINIMUM_AGE_YEARS, normalizeMobile } from '@sfsr/domain';

/**
 * The editable half of a buyer's own profile.
 *
 * ── What is NOT here, and why ─────────────────────────────────────────────
 *
 * `username` — `RESERVATION.doc` states it three separate times: "For record
 * integrity and audit purposes, the assigned username remains permanent and
 * cannot be changed."
 *
 * `email` — excluded by instruction, and the data agrees with the instruction:
 * the username is derived from the local part of the address at registration
 * (`andersonandy046@gmail.com` → `andersonandy046`), so letting the address
 * move would leave a permanent username pointing at an address that no longer
 * exists. It is also the identity Firebase Authentication signs in with, so
 * changing it here without re-verifying ownership would let anyone with an open
 * tab redirect the account's password resets.
 *
 * Nothing in the requirements forbids editing the REST. The read-only profile
 * page was an implementation choice, and `RESERVATION.doc` leans the other way:
 * "The system allows the buyer to edit any incorrect information."
 *
 * ── Why the rules are imported rather than restated ───────────────────────
 *
 * Every constraint below is the same function the registration schema calls.
 * A second, hand-written copy of the age rule is how a form starts accepting a
 * 19-year-old that registration would have refused — and it would fail
 * silently, because nothing compares the two.
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

export const profileSchema = z
  .object({
    firstName: required('First name').max(60),
    middleName: z.string().trim().max(60).optional().or(z.literal('')),
    lastName: required('Last name').max(60),
    suffix: z.string().trim().max(10).optional().or(z.literal('')),

    dateOfBirth: required('Date of birth').refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Enter a valid date.',
    ),

    sex: z.enum(SEX_OPTIONS),

    mobile: required('Mobile number').refine(
      (value) => normalizeMobile(value) !== null,
      'Enter a valid Philippine mobile number, e.g. 0917 810 1001.',
    ),
  })
  /*
   * The age floor is re-checked on EDIT, not only at registration.
   *
   * note.txt asks for "set age validation for user creation 21<". Enforcing it
   * only at creation leaves the obvious hole: register with a qualifying date,
   * then edit the date to anything. The rule is about who may hold an account,
   * not about who may fill in a form once.
   */
  .refine(
    (data) => {
      const dob = new Date(data.dateOfBirth);
      return Number.isNaN(dob.getTime()) || isOfLegalAge(dob, new Date());
    },
    {
      message: `You must be at least ${MINIMUM_AGE_YEARS} years old.`,
      path: ['dateOfBirth'],
    },
  );

export type ProfileInput = z.infer<typeof profileSchema>;

/** The name fields, which lock together once a reservation is under review. */
export const NAME_FIELDS = ['firstName', 'middleName', 'lastName', 'suffix'] as const;
