import { describe, expect, it } from 'vitest';
import { MINIMUM_AGE_YEARS, ageOn, isOfLegalAge } from './credentials';

/**
 * The registration age gate.
 *
 * note.txt raised it from 18 to 21 ("set age validation for user creation
 * 21<"). The boundary cases matter more than the number: an off-by-one here
 * either turns away a buyer on their birthday or lets one through the day
 * before it, and neither shows up in ordinary use.
 */
describe('ageOn', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    const born = new Date('2000-06-15T00:00:00Z');
    expect(ageOn(born, new Date('2026-06-14T00:00:00Z'))).toBe(25);
    expect(ageOn(born, new Date('2026-06-15T00:00:00Z'))).toBe(26);
    expect(ageOn(born, new Date('2026-06-16T00:00:00Z'))).toBe(26);
  });

  it('handles a December birthday read in January', () => {
    const born = new Date('2000-12-31T00:00:00Z');
    expect(ageOn(born, new Date('2026-01-01T00:00:00Z'))).toBe(25);
  });
});

describe('isOfLegalAge', () => {
  it('is 21, per the client instruction in note.txt', () => {
    expect(MINIMUM_AGE_YEARS).toBe(21);
  });

  it('admits a buyer exactly on their 21st birthday', () => {
    const born = new Date('2005-03-09T00:00:00Z');
    expect(isOfLegalAge(born, new Date('2026-03-09T00:00:00Z'))).toBe(true);
  });

  it('turns one away the day before', () => {
    const born = new Date('2005-03-09T00:00:00Z');
    expect(isOfLegalAge(born, new Date('2026-03-08T00:00:00Z'))).toBe(false);
  });

  it('still turns away someone who was old enough under the previous rule', () => {
    // 19 — over the old floor of 18, under the new one. This is the case the
    // change exists to catch, and the one most likely to be reported as a bug.
    const born = new Date('2007-01-01T00:00:00Z');
    expect(isOfLegalAge(born, new Date('2026-06-01T00:00:00Z'))).toBe(false);
  });
});
