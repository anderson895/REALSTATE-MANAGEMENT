import { describe, expect, it } from 'vitest';
import { trippingReference } from './identifiers';

/**
 * The reference is quoted between a buyer on the Portal and an agent on the
 * Internal queue, so the property that matters most is that both sides get the
 * same string from the same request — whatever shape the timestamp arrives in.
 */
describe('trippingReference', () => {
  it('composes the request date with a slice of the document id', () => {
    expect(trippingReference('a3f2c9d1e0', '2025-05-18T09:25:00.000Z')).toBe('TR-20250518-A3F2');
  });

  it('gives the same answer for a Date as for the equivalent ISO string', () => {
    // The Portal reads a Firestore Timestamp and converts with .toDate();
    // the Internal query layer hands back an ISO string. Same request, so it
    // must be the same reference.
    const iso = '2026-08-07T14:40:00.000Z';
    expect(trippingReference('eF3ekJqz19', new Date(iso))).toBe(
      trippingReference('eF3ekJqz19', iso),
    );
  });

  it('drops the date segment when the timestamp has not landed yet', () => {
    // requestedAt is a server timestamp, so it reads back null in the moment
    // between the Portal's write and the server filling it in.
    expect(trippingReference('a3f2c9d1e0', null)).toBe('TR-A3F2');
    expect(trippingReference('a3f2c9d1e0', undefined)).toBe('TR-A3F2');
  });

  it('drops the date segment rather than printing Invalid Date', () => {
    expect(trippingReference('a3f2c9d1e0', 'not a date')).toBe('TR-A3F2');
  });

  it('survives an id shorter than the slice it takes', () => {
    expect(trippingReference('ab', '2025-05-18T09:25:00.000Z')).toBe('TR-20250518-AB');
  });

  /**
   * The date segment is taken in UTC on both surfaces. Were it taken locally,
   * a request raised at 08:00 in Manila would read 20250518 for the buyer and
   * 20250517 for an agent whose machine is set to UTC.
   */
  it('takes the day in UTC, not in the runtime zone', () => {
    expect(trippingReference('a3f2c9d1e0', '2025-05-18T23:59:00.000Z')).toBe('TR-20250518-A3F2');
    expect(trippingReference('a3f2c9d1e0', '2025-05-19T00:01:00.000Z')).toBe('TR-20250519-A3F2');
  });
});
