import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { ReservationStatus } from '@sfsr/domain';

/**
 * Read side of the Documentation Department dashboard.
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws that screen's queue with columns
 * the reservation document does not carry: the BUYER's name, the PROJECT, and
 * the DOCUMENT TYPE. A reservation stores `clientId`, `unitId` and nothing
 * else about any of them, so this joins the three collections that do.
 *
 * ── The join, and what it costs ───────────────────────────────────────────
 *
 * Deliberately NOT one read per row per collection. `getAll()` fetches the
 * whole set of units and clients in a single round trip, and the documents come
 * back in one `in` query — so a 25-row queue costs 25 (reservations) + up to 25
 * (units) + the number of DISTINCT buyers + 1 query, rather than 100 sequential
 * gets. The ids are de-duplicated first because one buyer usually owns several
 * rows, and `getAll` with no refs is skipped entirely rather than sent empty.
 *
 * The limit is what keeps this bounded: `in` accepts at most 30 values, so the
 * document lookup is chunked to match and the caller's limit is capped.
 */

/** Firestore refuses an `in` filter with more than 30 values. */
const IN_CHUNK = 30;

export const MAX_DOCUMENT_QUEUE = 60;

export interface DocumentQueueRow {
  readonly number: string;
  readonly status: ReservationStatus;
  readonly reservedAt: string | null;
  readonly documentDeadline: string | null;
  readonly deficiencyReason: string | null;
  /** Resolved from `clients`; falls back to the raw id if the buyer is gone. */
  readonly buyerName: string;
  readonly buyerId: string;
  readonly unitId: string;
  /** Resolved from `units` -> `projects`. */
  readonly projectId: string | null;
  readonly projectName: string;
  /** From `documents`. A reservation may have none uploaded yet. */
  readonly documentType: string | null;
  readonly documentStatus: string | null;
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

/** "Joshua Anderson" + "Padilla" -> "Joshua Anderson Padilla". */
function fullNameOf(raw: DocumentData | undefined): string | null {
  if (!raw) return null;
  const joined = [raw.firstName, raw.middleName, raw.lastName, raw.suffix]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter((part) => part !== '')
    .join(' ');
  return joined === '' ? null : joined;
}

/** `getAll` rejects an empty argument list, and a round trip for nothing is waste. */
async function fetchAll(
  db: Firestore,
  refs: readonly DocumentReference[],
): Promise<Map<string, DocumentData>> {
  const found = new Map<string, DocumentData>();
  if (refs.length === 0) return found;

  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    const data = snap.data();
    if (snap.exists && data) found.set(snap.id, data);
  }
  return found;
}

/**
 * The document verification queue, joined and ready to render.
 *
 * Ordered oldest first, like every other queue in this system: the buyer who
 * has waited longest sits at the top rather than under this morning's uploads.
 */
export async function listDocumentQueue(
  db: Firestore,
  statuses: readonly ReservationStatus[],
  limit = 25,
  /**
   * 1-based page. Paged with `offset()`, not a cursor: Firestore BILLS for
   * skipped documents, so this is only honest while the queue is small — and
   * the sheet's own pager tops out at five pages. A cursor would be right for
   * a queue that grew into the thousands, and would mean carrying the last
   * document of the previous page through the URL.
   */
  page = 1,
): Promise<DocumentQueueRow[]> {
  if (statuses.length === 0) return [];

  const capped = Math.min(limit, MAX_DOCUMENT_QUEUE);
  const snap = await db
    .collection('reservations')
    .where('status', 'in', [...statuses])
    .orderBy('reservedAt', 'asc')
    .offset(Math.max(0, page - 1) * capped)
    .limit(capped)
    .get();

  if (snap.empty) return [];

  const rows = snap.docs.map((doc) => ({ number: doc.id, raw: doc.data() }));

  // De-duplicate before fetching: several reservations commonly share a buyer,
  // and a unit id repeats if one was reserved, released and reserved again.
  const unitIds = [...new Set(rows.map((r) => String(r.raw.unitId ?? '')).filter(Boolean))];
  const clientIds = [...new Set(rows.map((r) => String(r.raw.clientId ?? '')).filter(Boolean))];

  const [units, clients, projects, documents] = await Promise.all([
    fetchAll(db, unitIds.map((id) => db.collection('units').doc(id))),
    fetchAll(db, clientIds.map((id) => db.collection('clients').doc(id))),
    db.collection('projects').limit(50).get(),
    fetchDocumentsFor(db, rows.map((r) => r.number)),
  ]);

  const projectNames = new Map<string, string>(
    projects.docs.map((doc) => [doc.id, String(doc.data().name ?? doc.id)]),
  );

  return rows.map(({ number, raw }) => {
    const unitId = String(raw.unitId ?? '');
    const projectId = toText(units.get(unitId)?.projectId);
    const buyerId = String(raw.clientId ?? '');
    const document = documents.get(number);

    return {
      number,
      status: raw.status as ReservationStatus,
      reservedAt: toIso(raw.reservedAt),
      documentDeadline: toIso(raw.documentDeadline),
      deficiencyReason: toText(raw.deficiencyReason),
      // The id is a poor label but an honest one — better than "Unknown",
      // which hides which record is broken.
      buyerName: fullNameOf(clients.get(buyerId)) ?? buyerId,
      buyerId,
      unitId,
      projectId,
      projectName: projectId ? (projectNames.get(projectId) ?? projectId) : '—',
      documentType: toText(document?.docType),
      documentStatus: toText(document?.status),
    };
  });
}

/**
 * The most recent uploaded document per reservation.
 *
 * Chunked at 30 because that is the `in` ceiling. Ordering is not requested
 * from Firestore — adding one would need a composite index for a lookup that
 * returns a handful of rows, so the newest is picked here instead.
 */
async function fetchDocumentsFor(
  db: Firestore,
  numbers: readonly string[],
): Promise<Map<string, DocumentData>> {
  const latest = new Map<string, DocumentData>();
  if (numbers.length === 0) return latest;

  const chunks: string[][] = [];
  for (let i = 0; i < numbers.length; i += IN_CHUNK) {
    chunks.push(numbers.slice(i, i + IN_CHUNK));
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection('documents').where('reservationNumber', 'in', chunk).get(),
    ),
  );

  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const data = doc.data();
      const key = String(data.reservationNumber ?? '');
      if (!key) continue;
      const held = latest.get(key);
      const heldAt = toIso(held?.uploadedAt) ?? '';
      const thisAt = toIso(data.uploadedAt) ?? '';
      if (!held || thisAt > heldAt) latest.set(key, data);
    }
  }

  return latest;
}

export interface ClientMasterfileRow {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly mobile: string | null;
  readonly tier: string;
}

function toMasterfile(id: string, raw: DocumentData): ClientMasterfileRow {
  return {
    id,
    name: fullNameOf(raw) ?? id,
    username: String(raw.username ?? ''),
    email: String(raw.email ?? ''),
    mobile: toText(raw.mobile),
    tier: String(raw.tier ?? 'INITIAL'),
  };
}

/**
 * One buyer, for the CLIENT MASTERFILE panel the sheet puts down the right of
 * the dashboard.
 *
 * COST: 1 read, and only when a client is actually selected — the panel opens
 * empty, exactly as the sheet draws it.
 */
export async function getClientMasterfile(
  db: Firestore,
  clientId: string,
): Promise<ClientMasterfileRow | null> {
  if (!clientId.trim()) return null;

  const doc = await db.collection('clients').doc(clientId).get();
  const raw = doc.data();
  if (!doc.exists || !raw) return null;

  return toMasterfile(doc.id, raw);
}

/**
 * The masterfile panel's "Search Client…" box.
 *
 * ── What this can and cannot find ─────────────────────────────────────────
 *
 * Firestore has no substring or full-text search. There is no query for "any
 * client whose name contains 'padilla'" — the only string matching it offers
 * is a range scan, which gives PREFIX matching and nothing else.
 *
 * So this searches by prefix on the fields that have one worth searching:
 * last name, username and email. Typing "pad" finds Padilla; typing "adilla"
 * finds nobody, and pretending otherwise by filtering in memory would mean
 * reading the whole client collection on every keystroke.
 *
 * The `` upper bound is the standard trick: it is a very high private-use
 * code point, so `>= 'pad'` and `<= 'pad'` brackets every string starting
 * with "pad".
 *
 * COST: 3 bounded queries, capped at `limit` documents each.
 */
export async function searchClients(
  db: Firestore,
  term: string,
  limit = 8,
): Promise<ClientMasterfileRow[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const end = `${query}`;
  const lower = query.toLowerCase();

  const [byLastName, byUsername, byEmail] = await Promise.all([
    // Names are stored capitalised as the buyer typed them, so the surname
    // scan is matched on the term as given.
    db.collection('clients').orderBy('lastName').startAt(query).endAt(end).limit(limit).get(),
    db
      .collection('clients')
      .orderBy('username')
      .startAt(lower)
      .endAt(`${lower}`)
      .limit(limit)
      .get(),
    db
      .collection('clients')
      .orderBy('email')
      .startAt(lower)
      .endAt(`${lower}`)
      .limit(limit)
      .get(),
  ]);

  // One buyer can match on two fields at once; de-duplicate by document id.
  const found = new Map<string, ClientMasterfileRow>();
  for (const snap of [byLastName, byUsername, byEmail]) {
    for (const doc of snap.docs) {
      if (!found.has(doc.id)) found.set(doc.id, toMasterfile(doc.id, doc.data()));
    }
  }

  return [...found.values()].slice(0, limit);
}

/**
 * How many rows the queue holds in total, for the pager's "of N entries".
 *
 * COST: 1 aggregation, flat.
 */
export async function countDocumentQueue(
  db: Firestore,
  statuses: readonly ReservationStatus[],
): Promise<number> {
  if (statuses.length === 0) return 0;
  const snap = await db
    .collection('reservations')
    .where('status', 'in', [...statuses])
    .count()
    .get();
  return snap.data().count;
}

/** COST: 1 aggregation. Used for the "Active Client Masterfiles" counter. */
export async function countClients(db: Firestore): Promise<number> {
  const snap = await db.collection('clients').count().get();
  return snap.data().count;
}

/** `{ [status]: { [projectId]: count } }`, plus a `total` per status. */
export interface StatusByProject {
  readonly total: number;
  readonly byProject: Readonly<Record<string, number>>;
}

/**
 * Each summary card's figure, broken down by project.
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws every card on the Documentation
 * dashboard as a per-project list with a TOTAL under it, so a single number is
 * not enough — the department wants to know WHERE the work is.
 *
 * ── Why this is aggregations and not a scan ───────────────────────────────
 *
 * The obvious version reads every reservation and tallies them in memory. That
 * costs one read per reservation on every dashboard load and grows forever;
 * `catalog.queries.ts` rule 1 exists precisely to stop it. This runs one
 * count() per (status, project) pair instead — statuses × projects reads,
 * flat, no matter how many reservations sit behind them.
 *
 * It only works because `projectId` is denormalised onto the reservation at
 * submit. Aggregating on a field the document does not carry is what forced
 * the scan in the first place.
 *
 * COST: `statuses.length * projectIds.length` aggregations, run concurrently.
 * With the sheet's five cards and five projects that is 25.
 */
export async function countReservationsByStatusAndProject(
  db: Firestore,
  statuses: readonly ReservationStatus[],
  projectIds: readonly string[],
): Promise<Record<string, StatusByProject>> {
  const pairs = statuses.flatMap((status) =>
    projectIds.map((projectId) => ({ status, projectId })),
  );

  const results = await Promise.all(
    pairs.map(({ status, projectId }) =>
      db
        .collection('reservations')
        .where('status', '==', status)
        .where('projectId', '==', projectId)
        .count()
        .get(),
    ),
  );

  const out: Record<string, { total: number; byProject: Record<string, number> }> = {};
  for (const status of statuses) out[status] = { total: 0, byProject: {} };

  pairs.forEach((pair, index) => {
    const count = results[index]?.data().count ?? 0;
    const bucket = out[pair.status];
    if (!bucket) return;
    bucket.byProject[pair.projectId] = count;
    bucket.total += count;
  });

  return out;
}
