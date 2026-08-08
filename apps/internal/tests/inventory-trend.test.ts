import { describe, expect, it } from 'vitest';
import { buildTrend } from '../lib/inventory-trend';

/**
 * The trend is today's position with the audit trail UNDONE, month by month.
 *
 * Worth testing more than anything else on the dashboard, because it is the one
 * figure nobody can eyeball: a wrong count in the "Available" column of a table
 * is obvious, and a line that bends the wrong way three months ago is not.
 */

const NOW = new Date('2026-08-08T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('buildTrend', () => {
  it('draws six months, oldest first, ending at today', () => {
    const points = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, []);
    expect(points).toHaveLength(6);
    expect(points.map((p) => p.month)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']);
  });

  it('repeats today when nothing has moved — a flat trend IS the truth', () => {
    // The panel refuses to draw this case, but the arithmetic must still be
    // right rather than accidentally producing zeroes.
    const points = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, []);
    for (const point of points) {
      expect(point).toMatchObject({ Available: 150, 'On Hold': 0, Sold: 0 });
    }
  });

  it('undoes a hold: the unit was Available before it', () => {
    const points = buildTrend(NOW, { available: 149, onHold: 1, sold: 0 }, [
      { type: 'unit.held', unitId: 'EU001', at: at('2026-07-10T00:00:00Z') },
    ]);

    // August ends with the hold in place.
    expect(points.at(-1)).toMatchObject({ Available: 149, 'On Hold': 1 });
    // June — before it happened — has the unit back on the market.
    expect(points[3]).toMatchObject({ month: 'Jun', Available: 150, 'On Hold': 0 });
  });

  it('undoes a sale back through its hold', () => {
    const points = buildTrend(NOW, { available: 149, onHold: 0, sold: 1 }, [
      { type: 'unit.sold', unitId: 'EU001', at: at('2026-07-20T00:00:00Z') },
      { type: 'unit.held', unitId: 'EU001', at: at('2026-05-02T00:00:00Z') },
    ]);

    expect(points.at(-1)).toMatchObject({ Available: 149, 'On Hold': 0, Sold: 1 });
    // June: sold undone, so it is back On Hold.
    expect(points[3]).toMatchObject({ month: 'Jun', Available: 149, 'On Hold': 1, Sold: 0 });
    // April: the hold undone too, so it is Available again.
    expect(points[1]).toMatchObject({ month: 'Apr', Available: 150, 'On Hold': 0, Sold: 0 });
  });

  it('undoes a created unit — before it, the unit did not exist', () => {
    const points = buildTrend(NOW, { available: 151, onHold: 0, sold: 0 }, [
      { type: 'unit.created', unitId: 'MP001', at: at('2026-07-05T00:00:00Z') },
    ]);

    expect(points.at(-1)!.Available).toBe(151);
    expect(points[3]).toMatchObject({ month: 'Jun', Available: 150 });
  });

  it('returns a release to whichever state its previous event left it in', () => {
    /*
     * The one thing `unit.released` does not record is what it came back FROM —
     * the payload is `{ unitId, reason }`. The unit's previous event is the
     * answer, and getting this wrong swaps a unit between the On Hold and Sold
     * lines for every month before the release.
     */
    const fromSold = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, [
      { type: 'unit.released', unitId: 'EU001', at: at('2026-07-20T00:00:00Z') },
      { type: 'unit.sold', unitId: 'EU001', at: at('2026-05-01T00:00:00Z') },
    ]);
    expect(fromSold[3]).toMatchObject({ month: 'Jun', Available: 149, Sold: 1, 'On Hold': 0 });

    const fromHold = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, [
      { type: 'unit.released', unitId: 'EU001', at: at('2026-07-20T00:00:00Z') },
      { type: 'unit.held', unitId: 'EU001', at: at('2026-05-01T00:00:00Z') },
    ]);
    expect(fromHold[3]).toMatchObject({ month: 'Jun', Available: 149, 'On Hold': 1, Sold: 0 });
  });

  it('assumes On Hold for a release whose prior event predates the window', () => {
    // Stated in the module doc rather than hidden: the dominant path is a
    // reservation that expired or was cancelled before contract signing.
    const points = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, [
      { type: 'unit.released', unitId: 'EU001', at: at('2026-07-20T00:00:00Z') },
    ]);
    expect(points[3]).toMatchObject({ month: 'Jun', 'On Hold': 1, Sold: 0 });
  });

  it('never reports a negative count', () => {
    /*
     * An incomplete window can drive a counter below zero — a hold recorded
     * inside the window whose unit was created outside it, for instance. A
     * negative unit count on a chart is worse than a slightly wrong one, and
     * would drag the whole y-axis below the baseline.
     */
    const points = buildTrend(NOW, { available: 0, onHold: 0, sold: 0 }, [
      { type: 'unit.created', unitId: 'A1', at: at('2026-07-01T00:00:00Z') },
      { type: 'unit.created', unitId: 'A2', at: at('2026-07-02T00:00:00Z') },
    ]);

    for (const point of points) {
      expect(point.Available).toBeGreaterThanOrEqual(0);
      expect(point['On Hold']).toBeGreaterThanOrEqual(0);
      expect(point.Sold).toBeGreaterThanOrEqual(0);
    }
  });

  it('ignores events that are not unit movements', () => {
    // The caller filters, but the switch must not react to a stray type either.
    const points = buildTrend(NOW, { available: 150, onHold: 0, sold: 0 }, [
      { type: 'reservation.approved', unitId: '', at: at('2026-07-01T00:00:00Z') },
      { type: 'employee.created', unitId: '', at: at('2026-06-01T00:00:00Z') },
    ]);
    expect(points[0]).toMatchObject({ Available: 150, 'On Hold': 0, Sold: 0 });
  });
});
