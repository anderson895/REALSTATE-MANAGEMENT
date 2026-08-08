import { describe, expect, it } from 'vitest';
import { computeProjectStats } from './catalog.mutations';

/**
 * The one definition of "how many units are available".
 *
 * Two callers depend on it with different read budgets — the seed scans every
 * collection once for all five projects, the /inventory action reads a single
 * project after one unit is added. They agree only because they call this.
 */

const unit = (over: Record<string, unknown> = {}) => ({
  status: 'Available',
  unitType: 'Studio',
  purchasePriceCentavos: 600_000_000,
  ...over,
});

describe('computeProjectStats', () => {
  it('counts each status separately and totals them', () => {
    const stats = computeProjectStats(
      [
        unit(),
        unit(),
        unit({ status: 'On Hold' }),
        unit({ status: 'Sold' }),
        unit({ status: 'Sold' }),
      ],
      [{ status: 'Available' }, { status: 'Sold' }],
    );

    expect(stats.totalUnits).toBe(5);
    expect(stats.availableUnits).toBe(2);
    expect(stats.onHoldUnits).toBe(1);
    expect(stats.soldUnits).toBe(2);
    expect(stats.totalParking).toBe(2);
    expect(stats.availableParking).toBe(1);
  });

  it('reports the cheapest and dearest unit, which is what the portal quotes from', () => {
    const stats = computeProjectStats(
      [
        unit({ purchasePriceCentavos: 600_000_000 }),
        unit({ purchasePriceCentavos: 3_900_000_000 }),
        unit({ purchasePriceCentavos: 750_000_000 }),
      ],
      [],
    );
    expect(stats.minPriceCentavos).toBe(600_000_000);
    expect(stats.maxPriceCentavos).toBe(3_900_000_000);
  });

  it('ignores a zero or missing price rather than reporting ₱0.00 as the cheapest', () => {
    // A landing page advertising "from ₱0.00" because one document was written
    // without a price is worse than showing nothing.
    const stats = computeProjectStats(
      [unit({ purchasePriceCentavos: 0 }), unit({ purchasePriceCentavos: undefined }), unit()],
      [],
    );
    expect(stats.minPriceCentavos).toBe(600_000_000);
  });

  it('returns null prices for a project with no units, not zero', () => {
    // A brand-new project added at /inventory is in exactly this state, and
    // `null` is what the browse pages check for before printing a range.
    const stats = computeProjectStats([], []);
    expect(stats.minPriceCentavos).toBeNull();
    expect(stats.maxPriceCentavos).toBeNull();
    expect(stats.totalUnits).toBe(0);
    expect(stats.unitTypes).toEqual([]);
  });

  it('lists each unit type once, sorted', () => {
    const stats = computeProjectStats(
      [
        unit({ unitType: 'Two Bedroom' }),
        unit({ unitType: 'Studio' }),
        unit({ unitType: 'Two Bedroom' }),
        unit({ unitType: 'One Bedroom' }),
      ],
      [],
    );
    expect(stats.unitTypes).toEqual(['One Bedroom', 'Studio', 'Two Bedroom']);
  });
});
