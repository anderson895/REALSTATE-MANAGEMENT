import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { RESERVATION_STATUSES } from '@sfsr/domain';
import type {
  DownPaymentTier,
  FinancingOption,
  PaymentTerm,
  ReservationStatus,
} from '@sfsr/domain';

/**
 * Read-side queries for the Internal verification queues.
 *
 * ── Why these exist alongside FirestoreReservationRepository ───────────────
 *
 * The repository is the WRITE path: it reconstitutes a `Reservation` so the
 * status machine inside the entity can refuse an illegal transition. These
 * return flat rows instead, for two reasons — a queue screen only lists and
 * never transitions, and a React Server Component cannot hand a class instance
 * to the browser anyway. Dates leave here as ISO strings for the same reason.
 *
 * Same rules as catalog.queries.ts: never scan a collection to count it, bound
 * every query, and filter server-side. The status filter runs against the
 * (status, reservedAt) composite index already declared in
 * firestore.indexes.json — "Internal verification queues".
 */

/** Hard ceiling for any single queue query. */
export const MAX_RESERVATIONS_PER_QUERY = 100;

export interface UploadedFileRef {
  readonly publicId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface ReservationRow {
  readonly number: string;
  readonly clientId: string;
  readonly unitId: string;
  readonly parkingSlotId: string | null;
  readonly salesAgentId: string | null;
  readonly status: ReservationStatus;
  readonly reservedAt: string | null;
  readonly documentDeadline: string | null;
  readonly deficiencyDueAt: string | null;
  readonly deficiencyReason: string | null;
  readonly downPaymentTier: DownPaymentTier;
  readonly paymentTerm: PaymentTerm;
  readonly financingOption: FinancingOption;
  /**
   * The verification trail — note.txt: "ilologs kung sinong staff ang nag
   * verify, at kung sinong super visor ang nag approve."
   *
   * Employee IDs, not names. Resolving them is a separate lookup because one
   * screen shows a handful of rows and another shows one record, and joining
   * per row would cost a read each.
   */
  readonly paymentVerifiedBy: string | null;
  readonly paymentVerifiedAt: string | null;
  readonly documentsVerifiedBy: string | null;
  readonly documentsVerifiedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  /**
   * Which channel the reservation came in through.
   *
   * note.txt asks the Client Master Files screen for "Approved Reservation
   * from (Internal and Portal)" — so the two have to be distinguishable, and
   * nothing on the record distinguished them.
   *
   * Everything written before this field existed came from the Portal, because
   * that was the only way in; `toRow` defaults accordingly rather than showing
   * "unknown" for records whose origin is not actually in doubt.
   */
  readonly source: 'Portal' | 'Internal';
  /**
   * When the buyer sent a correction back against a deficiency.
   *
   * Without it a reviewer has no signal that anything changed: the status
   * stays `DeficiencyNoted` until a desk re-verifies, so a corrected ID would
   * sit in the queue looking identical to one nobody had answered.
   */
  readonly deficiencyRespondedAt: string | null;
}

export interface ReservationBuyer {
  readonly civilStatus: string | null;
  readonly nationality: string | null;
  readonly tin: string | null;
  readonly mobile: string | null;
  readonly address: string | null;
}

export interface ReservationPayment {
  readonly referenceNumber: string;
  readonly channel: string;
  readonly paymentDate: string | null;
  readonly amountCentavos: number;
  readonly status: string;
  readonly receipt: UploadedFileRef | null;
}

/**
 * What the automated ID check concluded, when it ran.
 *
 * A HINT for the reviewer, never a control — it is computed in the buyer's
 * browser and stored as submitted. What it buys is that Documentation opens
 * the record already knowing whether the name on the card matched the account,
 * instead of the system having checked and then said nothing.
 */
export interface DocumentNameCheck {
  readonly verdict: 'match' | 'review' | 'mismatch';
  readonly similarity: number;
  readonly registeredName: string;
  readonly readName: string;
}

/**
 * Whether the upload read as an identity document, and as the RIGHT one.
 *
 * note.txt: "ibalik yung OCR sa internal, dapat maveverify kung tama yung
 * format ng ID na inupload niya."
 *
 * The firmer half of the check. Whether a NAME matches is a judgement — OCR
 * misreads names constantly — but "this reads as a PhilHealth card and the
 * buyer selected Driver's Licence" is a fact about the file, and the one the
 * buyer's own browser refuses to submit on.
 *
 * `checkedAt` and `checkedBy` are set only when Documentation re-ran it from
 * the internal app. Absent means this is the buyer's browser reporting on
 * itself, which is a hint and not a finding.
 */
export interface DocumentFormatCheck {
  readonly verdict: 'match' | 'review' | 'mismatch';
  readonly looksLikeId: boolean | null;
  readonly idTypeMatch: boolean | null;
  readonly detectedId: string | null;
  readonly backSideDistinct: boolean | null;
  readonly checkedAt: string | null;
  readonly checkedBy: string | null;
}

export interface ReservationDocument {
  readonly docType: string;
  readonly idType: string | null;
  readonly status: string;
  readonly frontFile: UploadedFileRef | null;
  readonly backFile: UploadedFileRef | null;
  readonly nameCheck: DocumentNameCheck | null;
  readonly formatCheck: DocumentFormatCheck | null;
  /** The document id, so a re-check can write its result back. */
  readonly id: string;
  /** Set when the buyer sent this in answer to a deficiency notice. */
  readonly replacesDeficiency: string | null;
}

export interface ReservationDetail {
  readonly reservation: ReservationRow;
  readonly buyer: ReservationBuyer | null;
  readonly payment: ReservationPayment | null;
  readonly documents: readonly ReservationDocument[];
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

/** Reads back the stored check, refusing anything it does not recognise. */
function toNameCheck(value: unknown): DocumentNameCheck | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as DocumentData;
  const verdict = String(raw.verdict ?? '');
  if (verdict !== 'match' && verdict !== 'review' && verdict !== 'mismatch') return null;

  return {
    verdict,
    similarity: Number(raw.similarity ?? 0),
    registeredName: String(raw.registeredName ?? ''),
    readName: String(raw.readName ?? ''),
  };
}

/**
 * Reads back the format verdict.
 *
 * A tri-state on three of the fields, and `undefined` is not one of them:
 * `null` means the stage never ran, `false` means it ran and failed. A reader
 * that flattened the two would report "not an ID" for a card the check simply
 * never reached.
 */
function toFormatCheck(value: unknown): DocumentFormatCheck | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as DocumentData;
  const verdict = String(raw.verdict ?? '');
  if (verdict !== 'match' && verdict !== 'review' && verdict !== 'mismatch') return null;

  const tri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

  return {
    verdict,
    looksLikeId: tri(raw.looksLikeId),
    idTypeMatch: tri(raw.idTypeMatch),
    detectedId: toText(raw.detectedId),
    backSideDistinct: tri(raw.backSideDistinct),
    checkedAt: toIso(raw.checkedAt),
    checkedBy: toText(raw.checkedBy),
  };
}

function toFileRef(value: unknown): UploadedFileRef | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as DocumentData;
  if (!raw.publicId) return null;
  return {
    publicId: String(raw.publicId),
    fileName: String(raw.fileName ?? raw.publicId),
    mimeType: String(raw.mimeType ?? ''),
    sizeBytes: Number(raw.sizeBytes ?? 0),
  };
}

function toRow(id: string, raw: DocumentData): ReservationRow {
  return {
    number: id,
    clientId: String(raw.clientId ?? ''),
    unitId: String(raw.unitId ?? ''),
    parkingSlotId: toText(raw.parkingSlotId),
    salesAgentId: toText(raw.salesAgentId),
    status: raw.status as ReservationStatus,
    reservedAt: toIso(raw.reservedAt),
    documentDeadline: toIso(raw.documentDeadline),
    deficiencyDueAt: toIso(raw.deficiencyDueAt),
    deficiencyReason: toText(raw.deficiencyReason),
    downPaymentTier: Number(raw.downPaymentTier) as DownPaymentTier,
    paymentTerm: raw.paymentTerm as PaymentTerm,
    financingOption: raw.financingOption as FinancingOption,
    paymentVerifiedBy: toText(raw.paymentVerifiedBy),
    paymentVerifiedAt: toIso(raw.paymentVerifiedAt),
    documentsVerifiedBy: toText(raw.documentsVerifiedBy),
    documentsVerifiedAt: toIso(raw.documentsVerifiedAt),
    approvedBy: toText(raw.approvedBy),
    approvedAt: toIso(raw.approvedAt),
    source: raw.source === 'Internal' ? 'Internal' : 'Portal',
    deficiencyRespondedAt: toIso(raw.deficiencyRespondedAt),
  };
}

function toBuyer(value: unknown): ReservationBuyer | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as DocumentData;
  const address = (raw.address ?? {}) as DocumentData;
  const line = [
    raw.address ? [address.houseNo, address.street].filter(Boolean).join(' ') : null,
    address.barangay,
    address.city,
    address.province,
    address.zipCode,
  ]
    .filter((part) => part != null && String(part).trim() !== '')
    .join(', ');

  return {
    civilStatus: toText(raw.civilStatus),
    nationality: toText(raw.nationality),
    tin: toText(raw.tin),
    mobile: toText(raw.mobile),
    address: line === '' ? null : line,
  };
}

/**
 * One queue's worth of reservations, oldest first.
 *
 * Oldest first is deliberate: a verification queue is worked FIFO, so the
 * buyer who has been waiting longest is at the top rather than buried under
 * this morning's submissions.
 *
 * COST: one read per matching reservation, capped. Firestore allows at most
 * 30 values in an `in` filter; there are only nine statuses, so the whole
 * enum fits if a caller ever wants it.
 */
export async function listReservationsByStatus(
  db: Firestore,
  statuses: readonly ReservationStatus[],
  limit = MAX_RESERVATIONS_PER_QUERY,
): Promise<ReservationRow[]> {
  if (statuses.length === 0) return [];

  const snap = await db
    .collection('reservations')
    .where('status', 'in', [...statuses])
    .orderBy('reservedAt', 'asc')
    .limit(Math.min(limit, MAX_RESERVATIONS_PER_QUERY))
    .get();

  return snap.docs.map((doc) => toRow(doc.id, doc.data()));
}

/**
 * How many reservations sit at each status.
 *
 * For the dashboard pipeline chart, which needs the shape of the queue and
 * none of its contents. Rule 1 of catalog.queries.ts — never fetch a
 * collection to count it: reading 120 reservation documents to tally nine
 * numbers would cost 120 reads on every dashboard refresh, and grow with the
 * collection forever.
 *
 * COST: 9 count() aggregations, one read each. Constant regardless of how many
 * reservations exist.
 */
export async function countReservationsByStatus(
  db: Firestore,
): Promise<Record<ReservationStatus, number>> {
  const results = await Promise.all(
    RESERVATION_STATUSES.map((status) =>
      db.collection('reservations').where('status', '==', status).count().get(),
    ),
  );

  return Object.fromEntries(
    RESERVATION_STATUSES.map((status, index) => [status, results[index]?.data().count ?? 0]),
  ) as Record<ReservationStatus, number>;
}

/** COST: 1 read. */
export async function getReservation(
  db: Firestore,
  number: string,
): Promise<ReservationRow | null> {
  const doc = await db.collection('reservations').doc(number).get();
  const data = doc.data();
  return doc.exists && data ? toRow(doc.id, data) : null;
}

/**
 * Everything a reviewer needs on one screen.
 *
 * The buyer block is denormalised onto the reservation by the Portal's submit
 * handler, so it costs nothing extra. Payment and documents live in their own
 * collections because they are separate evidence with their own lifecycles.
 *
 * COST: 1 + 1 + up to `docLimit` reads.
 */
export async function getReservationDetail(
  db: Firestore,
  number: string,
  docLimit = 10,
): Promise<ReservationDetail | null> {
  const doc = await db.collection('reservations').doc(number).get();
  const raw = doc.data();
  if (!doc.exists || !raw) return null;

  const [paymentSnap, documentSnap] = await Promise.all([
    db.collection('payments').where('reservationNumber', '==', number).limit(1).get(),
    db.collection('documents').where('reservationNumber', '==', number).limit(docLimit).get(),
  ]);

  const paymentDoc = paymentSnap.docs[0]?.data();

  return {
    reservation: toRow(doc.id, raw),
    buyer: toBuyer(raw.buyer),
    payment: paymentDoc
      ? {
          referenceNumber: String(paymentDoc.referenceNumber ?? ''),
          channel: String(paymentDoc.channel ?? ''),
          paymentDate: toIso(paymentDoc.paymentDate),
          amountCentavos: Number(paymentDoc.amountCentavos ?? 0),
          status: String(paymentDoc.status ?? ''),
          receipt: toFileRef(paymentDoc.receipt),
        }
      : null,
    documents: documentSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        docType: String(data.docType ?? 'Document'),
        idType: toText(data.idType),
        status: String(data.status ?? ''),
        frontFile: toFileRef(data.frontFile),
        backFile: toFileRef(data.backFile),
        nameCheck: toNameCheck(data.nameCheck),
        formatCheck: toFormatCheck(data.formatCheck),
        replacesDeficiency: toText(data.replacesDeficiency),
      };
    }),
  };
}


/**
 * Employee id -> full name, for the verification trail.
 *
 * COST: one `getAll` round trip for the whole set, not a read per row. The
 * ids are de-duplicated first: a reservation verified and approved inside one
 * department repeats the same person two or three times.
 *
 * A missing employee falls back to their id at the call site rather than
 * being dropped — "EMP014" is a poor label but it is the truth, and hiding it
 * would make a deleted account look like nobody verified anything.
 */
export async function resolveEmployeeNames(
  db: Firestore,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id && id.trim() !== ''))];
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;

  const snaps = await db.getAll(...wanted.map((id) => db.collection('employees').doc(id)));
  for (const snap of snaps) {
    const data = snap.data();
    if (snap.exists && data?.fullName) names.set(snap.id, String(data.fullName));
  }
  return names;
}
