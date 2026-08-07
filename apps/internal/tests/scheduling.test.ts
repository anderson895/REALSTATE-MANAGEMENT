import { describe, expect, it } from 'vitest';
import { TRIPPING_STATUS_LABELS, formatPreferredDate } from '../lib/scheduling';

// `trippingReference` moved to @sfsr/domain when the Portal started rendering
// it too — its tests live beside it in value-objects/identifiers.test.ts.

describe('formatPreferredDate', () => {
  it('renders a plain calendar date in long form', () => {
    expect(formatPreferredDate('2025-05-20')).toBe('May 20, 2025');
  });

  /**
   * The reason the formatter is pinned to UTC. `new Date('2025-01-01')` is
   * parsed as UTC midnight; rendering that in any zone west of London gives
   * 31 December, and the buyer's chosen day would silently move.
   */
  it('does not slip a day at the year boundary', () => {
    expect(formatPreferredDate('2025-01-01')).toBe('January 1, 2025');
    expect(formatPreferredDate('2025-12-31')).toBe('December 31, 2025');
  });

  it('passes through anything that is not a calendar date', () => {
    expect(formatPreferredDate('')).toBe('—');
    expect(formatPreferredDate('sometime next week')).toBe('sometime next week');
  });
});

describe('TRIPPING_STATUS_LABELS', () => {
  it('renames only the stored status the sheet disagrees with', () => {
    // INTERNAL.xls draws a fresh request as "New"; Firestore stores
    // "Requested". The other three are called the same thing in both.
    expect(TRIPPING_STATUS_LABELS.Requested).toBe('New');
    expect(TRIPPING_STATUS_LABELS.Confirmed).toBe('Confirmed');
    expect(TRIPPING_STATUS_LABELS.Completed).toBe('Completed');
    expect(TRIPPING_STATUS_LABELS.Cancelled).toBe('Cancelled');
  });
});
