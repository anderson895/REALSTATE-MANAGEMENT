import { describe, expect, it } from 'vitest';
import { PASSWORD_POLICY, validatePassword } from '@sfsr/domain';
import { generateTemporaryPassword, suggestUsername } from '../lib/credentials';
import { validateWalkInBuyer } from '../lib/walk-in';

const buyer = (over: Partial<Parameters<typeof validateWalkInBuyer>[0]> = {}) => ({
  firstName: 'Joshua',
  middleName: '',
  lastName: 'Padilla',
  suffix: '',
  dateOfBirth: '1995-02-03',
  sex: 'Male',
  mobile: '09171234567',
  email: 'joshua@example.com',
  username: 'jpadilla',
  ...over,
});

describe('generateTemporaryPassword', () => {
  it('always satisfies the password policy the buyer will be held to', () => {
    // Generated 200 times: one class landing in the shuffle by luck would pass
    // a single run and fail in production a week later.
    for (let i = 0; i < 200; i++) {
      expect(validatePassword(generateTemporaryPassword())).toEqual([]);
    }
  });

  it('respects the policy minimum even when asked for less', () => {
    expect(generateTemporaryPassword(4).length).toBeGreaterThanOrEqual(
      PASSWORD_POLICY.minLength,
    );
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(50);
  });

  it('avoids glyphs that are misread when spoken or copied', () => {
    const banned = /[O0Il1]/;
    for (let i = 0; i < 100; i++) {
      expect(generateTemporaryPassword()).not.toMatch(banned);
    }
  });
});

describe('suggestUsername', () => {
  it('is first initial plus surname', () => {
    expect(suggestUsername('Joshua', 'Padilla')).toBe('jpadilla');
  });

  it('strips anything the username policy would reject', () => {
    expect(suggestUsername('Maria Theresa', "O'Brien-Santos")).toBe('mobriensantos');
  });

  it('pads a name too short to be a username', () => {
    // "J Yu" is a real name and produces "jyu" — three characters short.
    expect(suggestUsername('John', 'Yu').length).toBeGreaterThanOrEqual(6);
  });

  it('returns empty rather than guessing when there is nothing to work with', () => {
    expect(suggestUsername('', '')).toBe('');
  });
});

describe('validateWalkInBuyer', () => {
  it('accepts a complete buyer', () => {
    expect(validateWalkInBuyer(buyer())).toEqual({});
  });

  it('holds the counter to the same age rule as the Portal', () => {
    // 19 — old enough under the previous rule, not under 21.
    const errors = validateWalkInBuyer(buyer({ dateOfBirth: '2007-01-01' }));
    expect(errors.dateOfBirth).toMatch(/21/);
  });

  it('insists on an email, because the account cannot exist without one', () => {
    expect(validateWalkInBuyer(buyer({ email: '' })).email).toBeDefined();
    expect(validateWalkInBuyer(buyer({ email: 'not-an-email' })).email).toBeDefined();
  });

  it('reports every problem at once', () => {
    const errors = validateWalkInBuyer(
      buyer({ firstName: '', lastName: '', email: '', username: 'x' }),
    );
    // A counter should not discover four mistakes over four submissions.
    expect(Object.keys(errors).sort()).toEqual(['email', 'firstName', 'lastName', 'username']);
  });
});
