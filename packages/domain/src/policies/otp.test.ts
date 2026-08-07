import { describe, expect, it } from 'vitest';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  canResend,
  checkOtp,
  otpFailureMessage,
  type OtpRecord,
} from './otp';

const NOW = new Date('2026-08-03T12:00:00Z');
const HASH = 'a'.repeat(64);

const record = (over: Partial<OtpRecord> = {}): OtpRecord => ({
  codeHash: HASH,
  expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
  attempts: 0,
  createdAt: NOW,
  ...over,
});

describe('checkOtp', () => {
  it('accepts the right code inside the window', () => {
    expect(checkOtp(record(), HASH, NOW)).toEqual({ ok: true });
  });

  it('refuses the wrong code', () => {
    expect(checkOtp(record(), 'b'.repeat(64), NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a missing record without pretending it was a wrong code', () => {
    expect(checkOtp(null, HASH, NOW)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('refuses one millisecond past expiry', () => {
    const at = new Date(NOW.getTime() + OTP_TTL_MS + 1);
    expect(checkOtp(record(), HASH, at)).toEqual({ ok: false, reason: 'expired' });
  });

  it('still accepts on the last millisecond of the window', () => {
    const at = new Date(NOW.getTime() + OTP_TTL_MS);
    expect(checkOtp(record(), HASH, at)).toEqual({ ok: true });
  });

  it('locks out after the attempt cap', () => {
    expect(checkOtp(record({ attempts: OTP_MAX_ATTEMPTS }), HASH, NOW)).toEqual({
      ok: false,
      reason: 'too-many-attempts',
    });
  });

  it('checks the attempt cap BEFORE the code itself', () => {
    // Otherwise a locked-out record still answers "right or wrong", which is
    // an oracle: the cap would stop the guessing but not the information.
    const locked = record({ attempts: OTP_MAX_ATTEMPTS });
    expect(checkOtp(locked, HASH, NOW).ok).toBe(false);
    expect(checkOtp(locked, 'b'.repeat(64), NOW)).toEqual(
      checkOtp(locked, HASH, NOW),
    );
  });

  it('checks expiry BEFORE the code itself', () => {
    const at = new Date(NOW.getTime() + OTP_TTL_MS + 1);
    expect(checkOtp(record(), HASH, at)).toEqual(checkOtp(record(), 'b'.repeat(64), at));
  });
});

describe('otpFailureMessage', () => {
  it('says the same thing for a wrong code and an unknown one', () => {
    // The request page refuses to reveal whether an address is registered.
    // A distinct "no code was ever sent" here would hand that back.
    expect(otpFailureMessage('mismatch')).toBe(otpFailureMessage('not-found'));
  });

  it('names expiry and lockout, which are states the person must act on', () => {
    expect(otpFailureMessage('expired')).toContain('expired');
    expect(otpFailureMessage('too-many-attempts')).toContain('Too many');
  });
});

describe('canResend', () => {
  it('allows the first send', () => {
    expect(canResend(null, NOW)).toBe(true);
  });

  it('blocks a second send inside the cooldown', () => {
    expect(canResend(new Date(NOW.getTime() - 30_000), NOW)).toBe(false);
  });

  it('allows one after the cooldown', () => {
    expect(canResend(new Date(NOW.getTime() - 61_000), NOW)).toBe(true);
  });
});
