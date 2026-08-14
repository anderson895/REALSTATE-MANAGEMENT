'use server';

import { revalidatePath } from 'next/cache';
import { ClientId, clientProfileUpdated, normalizeMobile } from '@sfsr/domain';
import { FirestoreAuditLogger, getAdminFirestore } from '@sfsr/infrastructure/server';
import { requireClient } from '@/lib/session';
import { NAME_FIELDS, profileSchema } from '@/lib/schemas/profile';

/**
 * A buyer editing their own profile.
 *
 * Layer 2 of three (Development Plan.md §3.3): `proxy.ts` has already checked
 * that a session cookie exists, and the Security Rules seal `clients` from the
 * browser regardless. This re-derives WHOSE record is being written from the
 * session — never from the form — so the request cannot name another buyer.
 */

/**
 * Reservation states in which the buyer's NAME is frozen.
 *
 * ── Why the name is special ───────────────────────────────────────────────
 *
 * Nothing in the requirements forbids a buyer from editing their profile; the
 * only field `RESERVATION.doc` freezes is the username. But the name is not
 * free-floating data — Documentation Staff verify a government ID *against it*,
 * and the internal reservation screen reads it LIVE from this document rather
 * than from a snapshot on the reservation. The comment there quotes the client:
 * "dapat match ang ID sa name ng client".
 *
 * So a buyer who renamed themselves after verification would silently rewrite
 * the name a reviewer had already approved an ID for, on a screen that offers
 * no hint the two ever differed.
 *
 * ── Why these states and not simply "has a reservation" ───────────────────
 *
 * `DeficiencyNoted` is deliberately ABSENT. That status exists because staff
 * found something wrong and are waiting on the buyer to fix it — and a
 * misspelt name is one of the things they find. Locking it there would freeze
 * the buyer out of the correction the deficiency is asking for.
 *
 * `Expired` and `Cancelled` are absent for the plainer reason: nobody is
 * relying on that record any more.
 */
const NAME_LOCKING_STATUSES: readonly string[] = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DocumentsVerified',
  'Approved',
  'ContractSigned',
  'Completed',
];

export interface UpdateProfileResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** Present on success so the page can confirm what actually moved. */
  readonly changed?: readonly string[];
}

/** Fields as they are stored, for diffing against what was submitted. */
type Stored = Record<string, unknown>;

function diff(before: Stored, after: Stored): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    // Both normalised to a trimmed string first: `undefined` in Firestore and
    // '' from an untouched optional input are the same absence, and reporting
    // that as a change would fill the audit trail with edits nobody made.
    const from = before[key] == null ? '' : String(before[key]).trim();
    const to = value == null ? '' : String(value).trim();
    if (from !== to) changes[key] = { from: before[key] ?? null, to: value };
  }
  return changes;
}

export async function updateProfile(input: unknown): Promise<UpdateProfileResult> {
  const session = await requireClient();

  // Re-validated on the server even though the form already checked. Client
  // validation is a convenience; this is the control (§3.3).
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  const db = getAdminFirestore();
  const ref = db.collection('clients').doc(session.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: 'Your account record could not be found.' };
  }
  const before = snap.data() ?? {};

  // normalizeMobile already returned non-null inside the schema; this is the
  // canonical form ('+639178101001' and '0917 810 1001' both become
  // '09178101001'), so the stored value does not depend on how it was typed.
  const mobile = normalizeMobile(parsed.data.mobile) ?? parsed.data.mobile;

  const after: Stored = {
    firstName: parsed.data.firstName,
    middleName: parsed.data.middleName ?? '',
    lastName: parsed.data.lastName,
    suffix: parsed.data.suffix ?? '',
    dateOfBirth: parsed.data.dateOfBirth,
    sex: parsed.data.sex,
    mobile,
  };

  const changes = diff(before, after);
  if (Object.keys(changes).length === 0) {
    return { ok: true, changed: [] };
  }

  // ── The name lock ────────────────────────────────────────────────────────
  const renaming = NAME_FIELDS.some((field) => field in changes);
  if (renaming) {
    // COST: one read per reservation this buyer has, and most have none or one.
    // `select()` keeps it to the status field rather than pulling whole
    // documents to look at one string.
    const reservations = await db
      .collection('reservations')
      .where('clientId', '==', session.uid)
      .select('status')
      .get();

    const blocking = reservations.docs
      .map((doc) => String(doc.data().status ?? ''))
      .filter((status) => NAME_LOCKING_STATUSES.includes(status));

    if (blocking.length > 0) {
      return {
        ok: false,
        error:
          'Your name cannot be changed while a reservation is being reviewed, because your ' +
          'government-issued ID has been verified against it. Everything else on this page can ' +
          'still be updated. To correct your name, please contact St. Francis Square Realty.',
        fieldErrors: Object.fromEntries(
          NAME_FIELDS.filter((field) => field in changes).map((field) => [
            field,
            'Locked while a reservation is under review.',
          ]),
        ),
      };
    }
  }

  await ref.update({ ...after, profileUpdatedAt: new Date() });

  /*
   * Audited because note.txt asks for an audit trail, and because this is the
   * one place a record a verifier relied on can move underneath them. Recorded
   * AFTER the write rather than inside a transaction: the log is a statement
   * that something happened, and an entry for a write that then failed would be
   * worse than a write with no entry.
   */
  await new FirestoreAuditLogger(db).record(
    [clientProfileUpdated(new ClientId(session.uid), changes, new Date())],
    session.uid,
  );

  revalidatePath('/dashboard/profile');
  return { ok: true, changed: Object.keys(changes) };
}
