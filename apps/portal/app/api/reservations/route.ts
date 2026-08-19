import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ClientId,
  DomainError,
  ParkingSlotId,
  ReservationWorkflowService,
  UnitId,
  clientCan,
  normalizeMobile,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  FirestoreReservationRepository,
  FirestoreUnitOfWork,
  FirestoreUnitRepository,
  getAdminFirestore,
  getDiscountSchedule,
} from '@sfsr/infrastructure/server';
import { getClientSession } from '@/lib/session';
import { reservationSchema } from '@/lib/schemas/reservation';

/**
 * Submits a reservation application — STEP 9 of RESERVATION.doc.
 *
 * The unit is deliberately NOT held here. RESERVATION.doc puts the hold after
 * Account Receivables verifies the fee: "Once the payment has been verified
 * and approved, the selected unit is automatically tagged as On Hold."
 * Submitting records intent; verification takes the unit off the market.
 *
 * `ReservationWorkflowService` does the work inside one Firestore transaction,
 * so the reference number, the reservation record, and the audit entry commit
 * together or not at all. Two buyers submitting in the same second serialise
 * on the counter document rather than both receiving RES-2026-000001.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }
  if (!clientCan(session.tier, 'reserveUnit')) {
    return NextResponse.json({ error: 'Not available on this account.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.') || 'form'] ??= issue.message;
    }
    return NextResponse.json({ error: 'Please check the form.', fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const db = getAdminFirestore();

  const units = new FirestoreUnitRepository(db);
  const reservations = new FirestoreReservationRepository(db);
  const workflow = new ReservationWorkflowService(
    units,
    reservations,
    new FirestoreAuditLogger(db),
    new FirestoreUnitOfWork(db),
  );

  try {
    const number = await workflow.submit({
      clientId: new ClientId(session.uid),
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

    // Everything below hangs off the reservation and is written after the
    // transaction: none of it can invalidate the reservation itself, and
    // keeping the transaction small reduces contention on the counter.
    const batch = db.batch();

    /*
     * The unit's project, copied onto the reservation.
     *
     * COST: 1 read, once, at submit. It buys the Documentation dashboard its
     * per-project counters — INTERNAL.xls sheet `USER INTERFACE` breaks every
     * summary card down by project — for 5 count() aggregations per status
     * instead of a scan of the whole collection. Without it there is no way to
     * ask "how many pending reservations in Emerald Park" that does not read
     * every reservation and every unit behind them.
     *
     * The same denormalisation the buyer block below already does, and for the
     * same reason: the internal screens read one document instead of joining.
     * `workflow.submit` has already proved the unit exists, so a missing doc
     * here means it was deleted between the two, and null is the honest answer.
     */
    const unitSnap = await db.collection('units').doc(data.unitId).get();
    const projectId = unitSnap.exists ? (unitSnap.data()?.projectId ?? null) : null;

    /*
     * The discount rule this sale was made under, frozen onto the reservation.
     *
     * ── Why the rate is stored and not just the tier ─────────────────────
     *
     * It used to be only the tier: the discount was recomputed from
     * `downPaymentTier` every time anything displayed it. That was fine while
     * the rates were compiled into the bundle and could not move.
     *
     * comments.doc made them editable — "ang incharge sa pagpalit ng discount
     * is Documentation" — and the moment they can move, recomputing means
     * every approved reservation on the 30% tier silently re-prices the day
     * somebody edits that tier, including ones with a signed Contract to Sell.
     * A Statement of Account that disagrees with the paper the buyer holds is
     * not a display bug.
     *
     * So the rule is copied here, at submit, and the reservation carries it for
     * life. Editing the schedule reaches new applications only. Reservations
     * written before this field existed have no snapshot; anything reading it
     * must fall back to the current schedule, which is the behaviour they
     * already had.
     */
    const { schedule } = await getDiscountSchedule(db);
    const appliedRule = schedule.find((rule) => rule.tier === data.downPaymentTier) ?? null;

    batch.set(
      db.collection('reservations').doc(number.value),
      {
        projectId,
        discountRule: appliedRule
          ? { tier: appliedRule.tier, rate: appliedRule.rate, base: appliedRule.base }
          : null,
        discountAppliedAt: FieldValue.serverTimestamp(),
        // Which channel this came in through. A staff-entered walk-in writes
        // 'Internal'; the Client Master Files screen shows both.
        source: 'Portal',
        // Buyer details captured at STEP 2, denormalised onto the reservation
        // so the internal review screen reads one document rather than
        // joining back to the client profile.
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
        // Consent and declarations are evidence: record what was agreed to.
        declarations: {
          acceptedTerms: true,
          truthful: data.declaredTruthful,
          reviewed: data.declaredReviewed,
          understandsNotAutomatic: data.declaredNotAutomatic,
          understandsVerification: data.declaredSubjectToVerification,
          agreed: data.declaredAgreed,
          acceptedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    batch.set(db.collection('payments').doc(), {
      reservationNumber: number.value,
      clientId: session.uid,
      paymentDate: data.payment.paymentDate,
      referenceNumber: data.payment.referenceNumber,
      channel: data.payment.channel,
      amountCentavos: data.payment.amountCentavos,
      receipt: data.payment.receipt,
      // RESERVATION.doc: "Submission of proof of payment does not
      // automatically constitute payment confirmation."
      status: 'Pending Verification',
      submittedAt: FieldValue.serverTimestamp(),
    });

    batch.set(db.collection('documents').doc(), {
      reservationNumber: number.value,
      buyerUid: session.uid,
      docType: 'Government ID',
      idType: data.governmentId.idType,
      // Stored as two fields, not an array: a reviewer opening this record
      // needs to know WHICH side they are looking at.
      frontFile: data.governmentId.frontFile,
      backFile: data.governmentId.backFile,
      /*
       * The browser's name check, stored as a HINT for the reviewer.
       *
       * Never a control: it arrives from the client and could be anything.
       * What it buys is that Documentation opens the record already knowing
       * whether the automated comparison matched, instead of the system having
       * checked and then said nothing.
       */
      nameCheck: data.governmentId.nameCheck ?? null,
      /*
       * And the FORMAT verdict — did it read as an ID at all, and as the one
       * the buyer selected. note.txt: "dapat maveverify kung tama yung format
       * ng ID na inupload niya."
       *
       * Same standing as `nameCheck`: a hint from the browser, never a
       * control. Documentation can re-run the check from the reservation page,
       * and that run is the only one a reviewer should lean on.
       */
      formatCheck: data.governmentId.formatCheck ?? null,
      status: 'Pending Validation',
      uploadedBy: session.uid,
      uploadedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // No cache purge here on purpose. Submitting does NOT change the unit's
    // status — RESERVATION.doc places the hold at payment verification — so
    // the cached browse pages are still accurate. The buyer's own
    // /dashboard/reservations reads uncached. The purge belongs in the
    // verification step, where availability actually changes.
    return NextResponse.json({ ok: true, reservationNumber: number.value });
  } catch (error) {
    if (error instanceof DomainError) {
      // A business rule said no — e.g. the unit was taken between the buyer
      // opening the wizard and pressing submit. That is a normal outcome, not
      // a fault, and the message is written for the buyer.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Reservation submit failed:', error);
    return NextResponse.json(
      { error: 'Could not submit your reservation. Please try again.' },
      { status: 500 },
    );
  }
}
