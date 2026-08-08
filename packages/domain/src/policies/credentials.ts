/**
 * Credential policy, transcribed from the Registration Page in RESERVATION.doc.
 *
 * Stated here as plain predicates rather than as a validation-library schema so
 * the domain package keeps its zero-dependency property — it has to run
 * unchanged in a Node script, a server route, and a browser bundle.
 *
 * The portal wraps these in zod for form ergonomics; the rules themselves live
 * in one place so the client form, the server route, and the seed script
 * cannot disagree about what a valid password is (§3.1).
 */

/** "6–20 characters. Letters and numbers only." */
export const USERNAME_POLICY = {
  minLength: 6,
  maxLength: 20,
  pattern: /^[a-zA-Z0-9]+$/,
  description: '6–20 characters. Letters and numbers only.',
} as const;

/**
 * "Password must contain at least: 8 characters, One uppercase letter,
 *  One lowercase letter, One number, One special character"
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialPattern: /[^a-zA-Z0-9]/,
} as const;

/**
 * The address an internal account signs in with.
 *
 * Employees have a username in RBAC.xls and no email; Firebase Auth requires
 * one, so it is synthesised from the username. `sfsr.internal` is deliberately
 * not a routable domain — nothing is ever delivered to these addresses, and a
 * real one would invite somebody to try.
 *
 * Both the seed and User Management mint accounts, and an account whose address
 * does not match the pattern is one nobody can look up by hand afterwards. So
 * the rule lives here, where neither can hold its own copy (§3.1).
 */
export const INTERNAL_EMAIL_DOMAIN = 'sfsr.internal';

export function internalEmailFor(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export interface PolicyViolation {
  readonly rule: string;
  readonly message: string;
}

export function validateUsername(value: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const trimmed = value.trim();

  if (trimmed.length < USERNAME_POLICY.minLength) {
    violations.push({
      rule: 'minLength',
      message: `Username must be at least ${USERNAME_POLICY.minLength} characters.`,
    });
  }
  if (trimmed.length > USERNAME_POLICY.maxLength) {
    violations.push({
      rule: 'maxLength',
      message: `Username must be at most ${USERNAME_POLICY.maxLength} characters.`,
    });
  }
  if (trimmed.length > 0 && !USERNAME_POLICY.pattern.test(trimmed)) {
    violations.push({
      rule: 'pattern',
      message: 'Username may contain letters and numbers only.',
    });
  }

  return violations;
}

/**
 * Returns every unmet requirement rather than the first one.
 *
 * A form that reveals one rule at a time makes the user resubmit repeatedly;
 * the page shows the whole checklist and ticks items off as they type.
 */
export function validatePassword(value: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (value.length < PASSWORD_POLICY.minLength) {
    violations.push({
      rule: 'length',
      message: `At least ${PASSWORD_POLICY.minLength} characters`,
    });
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(value)) {
    violations.push({ rule: 'uppercase', message: 'One uppercase letter' });
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(value)) {
    violations.push({ rule: 'lowercase', message: 'One lowercase letter' });
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(value)) {
    violations.push({ rule: 'number', message: 'One number' });
  }
  if (PASSWORD_POLICY.requireSpecial && !PASSWORD_POLICY.specialPattern.test(value)) {
    violations.push({ rule: 'special', message: 'One special character' });
  }

  return violations;
}

/** The checklist rendered under the password field, in document order. */
export const PASSWORD_REQUIREMENTS = [
  { rule: 'length', label: `${PASSWORD_POLICY.minLength} characters` },
  { rule: 'uppercase', label: 'One uppercase letter' },
  { rule: 'lowercase', label: 'One lowercase letter' },
  { rule: 'number', label: 'One number' },
  { rule: 'special', label: 'One special character' },
] as const;

/** Sex options, exactly as offered on the Registration Page. */
export const SEX_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;
export type Sex = (typeof SEX_OPTIONS)[number];

/**
 * Minimum age to register.
 *
 * Was 18, and inferred rather than given: RESERVATION.doc says nothing about
 * age, but a reservation leads to a Contract to Sell and under the Civil Code
 * a minor lacks the capacity to contract, so accepting a 16-year-old's
 * reservation would produce a voidable agreement and a refund dispute over a
 * non-refundable fee. Flagged as §12.32.
 *
 * note.txt now states it outright — "set age validation for user creation
 * 21<" — and 21 is stricter than the legal floor, so the inference and the
 * instruction do not conflict; the client's number simply wins.
 *
 * Anything that shows this to a buyer should interpolate the constant rather
 * than spell the number out, or the two drift the next time it moves.
 */
export const MINIMUM_AGE_YEARS = 21;

export function ageOn(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = asOf.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isOfLegalAge(dateOfBirth: Date, asOf: Date): boolean {
  return ageOn(dateOfBirth, asOf) >= MINIMUM_AGE_YEARS;
}

/**
 * Philippine mobile numbers.
 *
 * The seeded sales staff use `0917-810-1001`; buyers type all of
 * `09178101001`, `0917 810 1001`, and `+639178101001`. Normalise to the
 * canonical `09XXXXXXXXX` rather than rejecting a valid number for its
 * punctuation.
 */
export function normalizeMobile(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');

  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;

  return null;
}
