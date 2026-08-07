/**
 * One-time passcode policy for password reset.
 *
 * Pure rules, no I/O — so the numbers below can be argued about in one place
 * and tested without a mailbox.
 */

/** Six digits: short enough to retype from a phone, long enough to matter. */
export const OTP_LENGTH = 6;

/**
 * Ten minutes.
 *
 * Long enough to switch to a mail app and back on a slow connection, short
 * enough that a code left visible on a shared screen is worthless by the time
 * anyone finds it.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Five wrong guesses and the code dies.
 *
 * This is the whole security of a six-digit secret. There are a million
 * combinations, which sounds like plenty and is not: an unthrottled script
 * walks the entire space in minutes. Capping attempts is what turns 1,000,000
 * into "five chances", and five is generous for something being copied off a
 * screen.
 */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Sixty seconds between requests for the same address.
 *
 * Not primarily anti-brute-force — it is anti-mailbox-flooding. Without it
 * anyone who knows an address can use this endpoint to bury that person's
 * inbox, and Gmail's daily send quota is spent doing it.
 */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export interface OtpRecord {
  /** SHA-256 of the code. The plaintext is never stored — see `hashOtp`. */
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly createdAt: Date;
}

export type OtpFailure =
  | 'not-found'
  | 'expired'
  | 'too-many-attempts'
  | 'mismatch';

export type OtpCheck = { ok: true } | { ok: false; reason: OtpFailure };

/**
 * Grades a submitted code against a stored record.
 *
 * Takes the ALREADY-HASHED submission so this stays pure and the hashing lives
 * with the crypto. Order matters: expiry and attempt count are checked before
 * the comparison, so a dead code cannot be probed.
 */
export function checkOtp(
  record: OtpRecord | null,
  submittedHash: string,
  now: Date,
): OtpCheck {
  if (!record) return { ok: false, reason: 'not-found' };
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too-many-attempts' };
  if (now.getTime() > record.expiresAt.getTime()) return { ok: false, reason: 'expired' };
  if (record.codeHash !== submittedHash) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/** True when another code may be sent to this address yet. */
export function canResend(lastSentAt: Date | null, now: Date): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= OTP_RESEND_COOLDOWN_MS;
}

/**
 * What the person is told, for every failure.
 *
 * Deliberately vague about WHICH thing was wrong on a mismatch, because the
 * page that requests a code already refuses to say whether an address is
 * registered — and a precise "that code is wrong" here would give that away
 * for free. Expiry and lockout are named, because those are states the person
 * needs to act on and neither reveals whether the account exists.
 */
export function otpFailureMessage(reason: OtpFailure): string {
  switch (reason) {
    case 'expired':
      return 'That code has expired. Request a new one.';
    case 'too-many-attempts':
      return 'Too many incorrect attempts. Request a new code.';
    case 'not-found':
    case 'mismatch':
      return 'That code is not correct.';
  }
}
