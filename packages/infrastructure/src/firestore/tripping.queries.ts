import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';

/**
 * Read side of the tripping schedule.
 *
 * A tripping is not a domain entity — it has no invariants worth protecting,
 * no state machine, and nothing else depends on it. It is a request for a site
 * visit that one sales agent claims. Modelling it as an aggregate would buy
 * ceremony and no safety, so it stays a plain Firestore document with the
 * claim itself guarded by a transaction (see the Internal scheduling action).
 */

export const MAX_TRIPPINGS_PER_QUERY = 100;

/** Set by the Portal on submit; the rest are set when an agent acts. */
export const TRIPPING_STATUSES = ['Requested', 'Confirmed', 'Completed', 'Cancelled'] as const;
export type TrippingStatus = (typeof TRIPPING_STATUSES)[number];

export interface TrippingRow {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly projectId: string;
  readonly projectName: string;
  /** The date the buyer asked for, as they typed it (YYYY-MM-DD). */
  readonly preferredDate: string;
  readonly preferredTime: string | null;
  readonly notes: string | null;
  readonly status: TrippingStatus;
  readonly requestedAt: string | null;
  readonly confirmedByName: string | null;
  readonly confirmedAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function toText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

function toRow(id: string, raw: DocumentData): TrippingRow {
  return {
    id,
    clientId: String(raw.clientId ?? ''),
    clientName: String(raw.clientName ?? 'Unnamed buyer'),
    projectId: String(raw.projectId ?? ''),
    projectName: String(raw.projectName ?? raw.projectId ?? ''),
    preferredDate: String(raw.preferredDate ?? ''),
    preferredTime: toText(raw.preferredTime),
    notes: toText(raw.notes),
    status: (raw.status ?? 'Requested') as TrippingStatus,
    requestedAt: toIso(raw.requestedAt),
    confirmedByName: toText(raw.confirmedByName),
    confirmedAt: toIso(raw.confirmedAt),
  };
}

/**
 * Every tripping request, soonest visit first.
 *
 * Ordered on `preferredDate` alone so it runs off the automatic single-field
 * index — adding a status filter would need a composite index for a collection
 * that holds a handful of rows. The statuses are separated in the page instead,
 * which costs nothing at this size and one fewer index to deploy.
 *
 * COST: one read per request, capped.
 */
export async function listTrippings(
  db: Firestore,
  limit = MAX_TRIPPINGS_PER_QUERY,
): Promise<TrippingRow[]> {
  const snap = await db
    .collection('trippings')
    .orderBy('preferredDate', 'asc')
    .limit(Math.min(limit, MAX_TRIPPINGS_PER_QUERY))
    .get();

  return snap.docs.map((doc) => toRow(doc.id, doc.data()));
}
