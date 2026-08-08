import { unstable_cache } from 'next/cache';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@sfsr/infrastructure/server';

/**
 * Six months of inventory levels, reconstructed from the audit trail.
 *
 * ── There is no history table, and this is why there does not need to be ──
 *
 * A unit document holds ONE status. Nothing stores what it was last March, so a
 * trend chart has nowhere obvious to read from — and inventing one would be the
 * single most dishonest thing on this dashboard, because a flat green line at
 * 150 looks exactly like a real answer.
 *
 * `auditLogs` already records every move: `unit.created`, `unit.held`,
 * `unit.sold`, `unit.released`, each with the moment it happened, written inside
 * the same transaction as the change itself. Today's counts are known exactly.
 * So the past is today's position with the events UNDONE, one at a time, walking
 * backwards — which is not an estimate, it is the same arithmetic replayed.
 *
 * ── The one place it approximates, stated rather than buried ─────────────
 *
 * `unit.released` records that a unit returned to Available and not what it
 * returned FROM — the payload is `{ unitId, reason }`. Undoing it needs the
 * prior state, so this looks for that unit's previous event inside the window:
 * `unit.sold` before a release means it came back from Sold, anything else
 * means On Hold. A release whose prior event is older than six months has no
 * answer in the window and is assumed to be On Hold, which is the dominant path
 * — a reservation that expired or was cancelled before contract signing.
 *
 * The effect is bounded: it can misattribute a released unit between the On
 * Hold and Sold lines in a month at the very edge of the window. It cannot
 * change the Available line or the total.
 */

export interface TrendPoint {
  /** `Feb`, `Mar` — the month this position is the END of. */
  readonly month: string;
  readonly Available: number;
  readonly 'On Hold': number;
  readonly Sold: number;
}

export interface InventoryTrend {
  readonly points: readonly TrendPoint[];
  /**
   * How many audit entries the reconstruction is built from.
   *
   * Zero means every point is today's position repeated, which is TRUE — a
   * database where nothing has moved has a flat trend — but it is not a trend,
   * and the panel says so instead of drawing six months of confident line.
   */
  readonly eventsReplayed: number;
  /** Hit the cap, so the oldest months are less trustworthy. Surfaced, not hidden. */
  readonly truncated: boolean;
}

const MONTHS = 6;

/**
 * The read that pays for this chart.
 *
 * A range filter and an `orderBy` on the SAME field need no composite index, so
 * this works against a fresh project with nothing deployed. The cap is what
 * keeps it a fixed cost: 300 documents is roughly a year of ordinary activity
 * on this system, and blowing through it degrades the oldest month rather than
 * the bill.
 */
const MAX_EVENTS = 300;

const UNDOABLE = new Set(['unit.created', 'unit.held', 'unit.sold', 'unit.released']);

interface Move {
  readonly type: string;
  readonly unitId: string;
  readonly at: Date;
}

/** Start of the month, `count` months back from `from`. */
function monthStart(from: Date, back: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - back, 1));
}

function monthLabel(date: Date): string {
  return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

/**
 * Replays backwards and samples at each month boundary.
 *
 * Exported for its own sake: this is pure arithmetic over a list, and it is the
 * only part of the chart that can be wrong in a way nobody would notice.
 */
export function buildTrend(
  now: Date,
  current: { available: number; onHold: number; sold: number },
  /** Newest first. */
  moves: readonly Move[],
): TrendPoint[] {
  // For each release, what it came back FROM — the unit's previous event.
  const cameFrom = new Map<number, 'Sold' | 'On Hold'>();
  for (let i = 0; i < moves.length; i++) {
    if (moves[i]!.type !== 'unit.released') continue;
    // `moves` is newest first, so a LATER index is an EARLIER event.
    const previous = moves.slice(i + 1).find((m) => m.unitId === moves[i]!.unitId);
    cameFrom.set(i, previous?.type === 'unit.sold' ? 'Sold' : 'On Hold');
  }

  let { available, onHold, sold } = current;
  let cursor = 0;

  const points: TrendPoint[] = [];

  // Walk the boundaries newest-first, then reverse — each point is the position
  // at the END of that month, which is what a monthly trend means.
  for (let back = 0; back < MONTHS; back++) {
    const boundary = back === 0 ? now : monthStart(now, back - 1);

    // Undo everything that happened AFTER this boundary.
    while (cursor < moves.length && moves[cursor]!.at >= boundary) {
      const move = moves[cursor]!;
      switch (move.type) {
        case 'unit.created':
          // A unit is born Available, so before this it did not exist at all.
          available--;
          break;
        case 'unit.held':
          available++;
          onHold--;
          break;
        case 'unit.sold':
          onHold++;
          sold--;
          break;
        case 'unit.released':
          available--;
          if (cameFrom.get(cursor) === 'Sold') sold++;
          else onHold++;
          break;
      }
      cursor++;
    }

    points.push({
      month: monthLabel(back === 0 ? now : monthStart(now, back)),
      // Clamped: an incomplete window can drive a count below zero, and a
      // negative unit count on a chart is worse than a slightly wrong one.
      Available: Math.max(0, available),
      'On Hold': Math.max(0, onHold),
      Sold: Math.max(0, sold),
    });
  }

  return points.reverse();
}

async function readTrend(current: {
  available: number;
  onHold: number;
  sold: number;
}): Promise<InventoryTrend> {
  const now = new Date();
  const since = monthStart(now, MONTHS - 1);

  const snap = await getAdminFirestore()
    .collection('auditLogs')
    .where('occurredAt', '>=', Timestamp.fromDate(since))
    .orderBy('occurredAt', 'desc')
    .limit(MAX_EVENTS)
    .get();

  const moves: Move[] = snap.docs
    .map((doc) => {
      const raw = doc.data();
      const at = raw.occurredAt instanceof Timestamp ? raw.occurredAt.toDate() : null;
      return { type: String(raw.type ?? ''), unitId: String(raw.payload?.unitId ?? ''), at };
    })
    .filter((m): m is Move => m.at !== null && UNDOABLE.has(m.type));

  return {
    points: buildTrend(now, current, moves),
    eventsReplayed: moves.length,
    truncated: snap.size >= MAX_EVENTS,
  };
}

/**
 * Cached for SIX HOURS, not the sixty seconds the rest of the dashboard uses.
 *
 * This is the only figure on the page that reads a collection rather than
 * counting one, so it is the only one whose cost scales with activity. At the
 * dashboard's own 60-second TTL a busy day would refill it 1,440 times — up to
 * 432,000 reads against a 50,000/day Spark allowance, which would take the
 * whole project down to draw a line.
 *
 * Six hours is generous rather than reluctant: the points are MONTHLY, so this
 * cannot meaningfully change within a day.
 *
 * `unstable_cache` keys on the ARGUMENT, so today's counts are part of the
 * cache key — which is the behaviour we want and worth knowing about. A unit
 * selling changes the counts, misses the cache and rebuilds once, immediately,
 * without waiting out the window. Nothing selling means one refill every six
 * hours. Either way the ceiling is a few hundred reads a day.
 *
 * Deliberately NOT tagged `units`: the counters must refresh the instant a
 * payment is verified, and that has no business rebuilding six months of
 * history as well.
 */
export const getInventoryTrend = unstable_cache(readTrend, ['internal', 'inventory-trend'], {
  revalidate: 60 * 60 * 6,
});
