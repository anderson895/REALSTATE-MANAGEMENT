'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ClientId,
  DomainError,
  ParkingSlotId,
  UnitId,
  can,
  normalizeMobile,
} from '@sfsr/domain';
import {
  getAdminAuth,
  getAdminFirestore,
  searchClients,
  type ClientMasterfileRow,
} from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { reservationWorkflow } from '@/lib/reservations';
import {
  generateTemporaryPassword,
  suggestUsername,
  validateWalkInBuyer,
  type WalkInBuyerInput,
} from '@/lib/walk-in';
import { walkInSchema } from '@/lib/walk-in-schema';

/**
 * Server actions behind the walk-in counter.
 *
 * note.txt: "Add walking reservation on internal same process sa web portal",
 * and later, decisively: "documentation ang in charge for walk in application".
 *
 * Every action here re-checks `create` on RESERVATION_VERIFICATION rather than
 * trusting that the page rendered. Documentation holds it as part of FULL;
 * Billing has the module WITHOUT create, Sales has view and print, and IT has
 * neither. Three of the four are kept out by that one grant.
 */
async function requireEncoder() {
  const session = await requireModule('RESERVATION_VERIFICATION');
  if (!can(toActor(session), 'RESERVATION_VERIFICATION', 'create')) {
    throw new Error('Your role cannot raise a walk-in reservation.');
  }
  return session;
}

export interface BuyerHit {
  readonly uid: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly mobile: string;
  readonly tier: string;
}

function toHit(row: ClientMasterfileRow): BuyerHit {
  return {
    uid: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    mobile: row.mobile ?? '',
    tier: row.tier,
  };
}

/**
 * Find an existing account before creating a new one.
 *
 * The buyer at the counter may well have registered on the Portal already —
 * that is the whole point of having a Portal. Creating a second account splits
 * their history in half: two profiles, two sets of documents, and a Permanent
 * Client Account later built on the wrong one.
 *
 * PREFIX search only, on surname, username and email — Firestore has no
 * substring matching and pretending otherwise would mean reading the whole
 * client collection on every keystroke. The screen says so, because a search
 * that silently fails to find someone leads straight to a duplicate account.
 */
export async function searchBuyers(term: string): Promise<BuyerHit[]> {
  await requireEncoder();
  const rows = await searchClients(getAdminFirestore(), term, 8);
  return rows.map(toHit);
}

/**
 * A free username, suggested from the buyer's name.
 *
 * A server action rather than a helper the form calls directly, for two
 * reasons: `suggestUsername` lives beside `generateTemporaryPassword` in a
 * module that imports `node:crypto`, which cannot be bundled into a client
 * component — and only the server can say whether the suggestion is FREE.
 * Suggesting a taken name would send the staff member round the loop again.
 */
export async function suggestUsernameFor(firstName: string, lastName: string): Promise<string> {
  await requireEncoder();

  const base = suggestUsername(firstName, lastName);
  if (!base) return '';

  const db = getAdminFirestore();
  // A handful of tries, then give up and let them type one. Names collide;
  // an unbounded loop over a growing collection does not belong in a form.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const taken = await db.collection('usernames').doc(candidate).get();
    if (!taken.exists) return candidate;
  }
  return '';
}

export interface CreatedBuyer {
  readonly uid: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  /**
   * Shown ONCE, on screen, for the staff member to hand over.
   *
   * Not stored anywhere and not recoverable: Firebase Auth keeps a hash, and
   * there is no "show me the password again". If it is lost the buyer resets
   * it from the Portal, which is the correct path anyway.
   */
  readonly temporaryPassword: string;
}

/**
 * Create an Initial Account for a buyer standing at the counter.
 *
 * Mirrors the Portal's /api/auth/register — same three records, same rollback,
 * same INITIAL tier — with two differences that follow from who is typing:
 *
 *   - No CAPTCHA. It exists to prove a human is at the keyboard; an
 *     authenticated employee already is.
 *   - The password is GENERATED, not chosen. See `generateTemporaryPassword`.
 *
 * `createdBy` records the employee, so an account raised at the counter is
 * never mistaken for one the buyer opened themselves.
 */
export async function createBuyer(
  input: WalkInBuyerInput,
): Promise<{ ok: true; buyer: CreatedBuyer } | { ok: false; fieldErrors: Record<string, string> }> {
  const session = await requireEncoder();

  const fieldErrors = validateWalkInBuyer(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const mobile = normalizeMobile(input.mobile);
  const displayName = [input.firstName, input.lastName].map((p) => p.trim()).join(' ');

  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Checked before creating anything, so the common "taken" case does not
  // leave an orphaned Auth user behind.
  const taken = await db.collection('usernames').doc(username).get();
  if (taken.exists) {
    return { ok: false, fieldErrors: { username: 'That username is already taken.' } };
  }

  const temporaryPassword = generateTemporaryPassword();
  let uid: string | undefined;
  try {
    const user = await auth.createUser({ email, password: temporaryPassword, displayName });
    uid = user.uid;
    await auth.setCustomUserClaims(uid, { kind: 'client', tier: 'INITIAL', username });

    await db
      .collection('clients')
      .doc(uid)
      .set({
        uid,
        username,
        email,
        firstName: input.firstName.trim(),
        middleName: input.middleName.trim() || null,
        lastName: input.lastName.trim(),
        suffix: input.suffix.trim() || null,
        dateOfBirth: input.dateOfBirth,
        sex: input.sex,
        mobile,
        tier: 'INITIAL',
        /*
         * Consent, recorded honestly.
         *
         * The Portal writes `acceptedAt` because the buyer ticked the boxes
         * themselves. Here a staff member is at the keyboard, so what is
         * recorded is that consent was taken ON PAPER and by whom — the signed
         * form is the evidence, and this points at it rather than impersonating
         * a click the buyer never made.
         */
        consent: {
          takenOnPaper: true,
          takenBy: session.employeeId,
          acceptedAt: FieldValue.serverTimestamp(),
        },
        source: 'Internal',
        createdBy: session.employeeId,
        createdAt: FieldValue.serverTimestamp(),
      });

    await db.collection('usernames').doc(username).set({ email, uid, kind: 'client' });

    return {
      ok: true,
      buyer: { uid, name: displayName, username, email, temporaryPassword },
    };
  } catch (error) {
    // Undo, so the staff member can simply correct the field and try again.
    if (uid) {
      await auth.deleteUser(uid).catch(() => undefined);
      await db.collection('clients').doc(uid).delete().catch(() => undefined);
    }
    await db.collection('usernames').doc(username).delete().catch(() => undefined);

    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return {
        ok: false,
        fieldErrors: {
          email: 'An account with that email already exists — search for the buyer instead.',
        },
      };
    }
    console.error('Walk-in buyer creation failed:', error);
    return { ok: false, fieldErrors: { form: 'Could not create the account. Please try again.' } };
  }
}

export type SubmitResult =
  | { ok: true; reservationNumber: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * File the reservation.
 *
 * Deliberately the SAME path as the Portal: `ReservationWorkflowService.submit`
 * inside one transaction for the number, the record and the audit entry, then
 * a batch for everything that hangs off it. A walk-in that took a shortcut here
 * would produce reservations the verification screens could not read.
 *
 * What differs is two fields — `source: 'Internal'` and `encodedBy` — and they
 * are the reason the client asked for this at all: "Approved Reservation from
 * (Internal and Portal)" needs the two to be tellable apart.
 *
 * The status it lands in is the ordinary one. A counter-raised reservation is
 * NOT pre-verified: Billing still confirms the money arrived, and Documentation
 * still checks the ID, even though Documentation typed it. Encoding a form is
 * not verifying it, and the four-eyes rule in `canTakeAction` still decides who
 * may sign what afterwards.
 */
export async function submitWalkIn(payload: unknown): Promise<SubmitResult> {
  const session = await requireEncoder();

  const parsed = walkInSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.') || 'form'] ??= issue.message;
    }
    return { ok: false, error: 'Please check the form.', fieldErrors };
  }
  const data = parsed.data;

  const db = getAdminFirestore();

  // The buyer must still exist. The uid came from a search this staff member
  // ran, which may have been minutes ago.
  const buyerSnap = await db.collection('clients').doc(data.buyerUid).get();
  if (!buyerSnap.exists) {
    return { ok: false, error: 'That buyer no longer exists. Search for them again.' };
  }

  try {
    const number = await reservationWorkflow().submit({
      clientId: new ClientId(data.buyerUid),
      unitId: new UnitId(data.unitId),
      parkingSlotId: data.parkingSlotId ? new ParkingSlotId(data.parkingSlotId) : null,
      salesAgentId: data.salesAgentId || null,
      terms: {
        downPaymentTier: data.downPaymentTier,
        paymentTerm: data.paymentTerm,
        financingOption: data.financingOption,
      },
      at: new Date(),
    });

    const batch = db.batch();

    // Denormalised for the per-project counters on the Documentation
    // dashboard, exactly as the Portal route does it. COST: 1 read.
    const unitSnap = await db.collection('units').doc(data.unitId).get();
    const projectId = unitSnap.exists ? (unitSnap.data()?.projectId ?? null) : null;

    batch.set(
      db.collection('reservations').doc(number.value),
      {
        projectId,
        source: 'Internal',
        // WHO typed it. Not who verified it and not who approved it — those are
        // separate fields, filled by separate people, and the audit trail is
        // worth nothing if encoding is allowed to blur into either.
        encodedBy: session.employeeId,
        buyer: {
          civilStatus: data.civilStatus,
          nationality: data.nationality,
          tin: data.tin || null,
          mobile: normalizeMobile(data.mobile),
          address: {
            houseNo: data.houseNo || null,
            street: data.street,
            barangay: data.barangay,
            city: data.city,
            province: data.province,
            zipCode: data.zipCode,
          },
        },
        declarations: {
          // The counter equivalent of the buyer's five tick boxes: one claim
          // about a piece of paper, attributed to the person making it.
          signedFormOnFile: true,
          attestedBy: session.employeeId,
          acceptedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    batch.set(db.collection('payments').doc(), {
      reservationNumber: number.value,
      clientId: data.buyerUid,
      paymentDate: data.payment.paymentDate,
      referenceNumber: data.payment.referenceNumber,
      channel: data.payment.channel,
      amountCentavos: data.payment.amountCentavos,
      receipt: data.payment.receipt,
      status: 'Pending Verification',
      // The employee, not the buyer. `signedUrlFor` still resolves because the
      // FILE lives under the buyer's folder — see the /api/upload route.
      submittedBy: session.employeeId,
      submittedAt: FieldValue.serverTimestamp(),
    });

    batch.set(db.collection('documents').doc(), {
      reservationNumber: number.value,
      buyerUid: data.buyerUid,
      docType: 'Government ID',
      idType: data.governmentId.idType,
      frontFile: data.governmentId.frontFile,
      backFile: data.governmentId.backFile,
      /*
       * No `nameCheck`, and that is the truth rather than an omission.
       *
       * The Portal's check runs OCR in the BUYER's browser as they upload. Here
       * the staff member is holding the physical card and looking at the buyer,
       * which is a better check than OCR — but it is not the automated one, and
       * writing a `nameCheck` here would claim a comparison nothing performed.
       * The detail screen prints "No automated name check on file", which is
       * exactly what happened.
       */
      status: 'Pending Validation',
      uploadedBy: session.employeeId,
      uploadedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Submitting does not change unit availability — the hold lands at payment
    // verification — but the queues and counters this reservation now appears
    // in are stale immediately.
    updateTag('units');
    revalidatePath('/reservations');
    revalidatePath('/');

    return { ok: true, reservationNumber: number.value };
  } catch (error) {
    if (error instanceof DomainError) {
      // A rule said no — most often the unit was taken while the form was open.
      return { ok: false, error: error.message };
    }
    console.error('Walk-in submit failed:', error);
    return { ok: false, error: 'Could not file the reservation. Please try again.' };
  }
}
