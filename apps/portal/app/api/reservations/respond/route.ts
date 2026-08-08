import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { getClientSession } from '@/lib/session';

/**
 * The buyer's answer to a deficiency notice.
 *
 * ── Why this route had to exist ───────────────────────────────────────────
 *
 * Documentation notes a deficiency, the buyer is told what is wrong and given
 * 24 hours — and until now the Portal offered them no way to do anything about
 * it. `/dashboard/documents` is read-only, and the only button on the
 * reservation card was "Request withdrawal". A buyer told "the back of your ID
 * is unreadable, upload a clear one" could withdraw, or wait to expire. Both
 * lose the sale over a photograph.
 *
 * ── What responding does, and deliberately does not do ────────────────────
 *
 * It files a NEW document and stamps `deficiencyRespondedAt` so the queue can
 * show that the buyer has come back. It does NOT clear the deficiency and does
 * NOT change the status: only a desk re-verifying does that, which is
 * `clearDeficiency()` inside the entity. A buyer who could clear their own
 * deficiency by uploading anything at all would have found a way around the
 * verification entirely.
 *
 * The old document is left in place rather than overwritten. It is evidence of
 * what was originally submitted, and the queue picks the newest by
 * `uploadedAt`, so the reviewer sees the correction without losing the
 * history.
 */

/** What a buyer may say they are replacing. Free text would be unsortable. */
const DOCUMENT_TYPES = [
  'Government ID',
  'Proof of Payment',
  'Other supporting document',
] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  interface FilePayload {
    publicId?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  }

  let body: {
    reservationNumber?: unknown;
    docType?: unknown;
    frontFile?: FilePayload;
    backFile?: FilePayload;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const number = String(body.reservationNumber ?? '').trim();
  const docType = String(body.docType ?? '');
  if (!number) {
    return NextResponse.json({ error: 'Reservation is required.' }, { status: 400 });
  }
  if (!(DOCUMENT_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: 'Choose what you are replacing.' }, { status: 400 });
  }

  /*
   * Front and back, because an ID has two of them.
   *
   * The original submission captures both — a reviewer needs the address and
   * signature on the reverse as much as the photograph on the front — so a
   * correction that could only carry one file would replace half an ID and
   * leave the desk unable to complete the same check it failed the first time.
   *
   * The back stays OPTIONAL: a passport, a receipt and a birth certificate are
   * all one-sided, and demanding a second file for them would have buyers
   * photographing a blank page to get past the form.
   */
  const toFile = (raw: FilePayload | undefined) => {
    const publicId = String(raw?.publicId ?? '').trim();
    if (!publicId) return null;
    return {
      publicId,
      fileName: String(raw?.fileName ?? publicId),
      mimeType: String(raw?.mimeType ?? ''),
      sizeBytes: Number(raw?.sizeBytes ?? 0),
    };
  };

  const frontFile = toFile(body.frontFile);
  const backFile = toFile(body.backFile);

  if (!frontFile) {
    return NextResponse.json({ error: 'Attach the corrected file first.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection('reservations').doc(number);
  const snap = await ref.get();
  const data = snap.data();

  // Ownership first, then state. Checking the status of somebody else's
  // reservation would confirm it exists.
  if (!snap.exists || !data || data.clientId !== session.uid) {
    return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
  }
  if (data.status !== 'DeficiencyNoted') {
    return NextResponse.json(
      { error: 'There is nothing outstanding on this reservation.' },
      { status: 409 },
    );
  }

  const batch = db.batch();

  batch.set(db.collection('documents').doc(), {
    reservationNumber: number,
    buyerUid: session.uid,
    docType,
    // Marks this as a correction rather than an original submission, so a
    // reviewer opening the record knows which one to look at.
    replacesDeficiency: String(data.deficiencyReason ?? ''),
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    frontFile,
    backFile,
    status: 'Pending Validation',
    uploadedBy: session.uid,
    uploadedAt: FieldValue.serverTimestamp(),
  });

  // The reservation itself moves only in this one respect: the desk needs to
  // know somebody came back, and the 24-hour clock is still the clock.
  batch.update(ref, { deficiencyRespondedAt: FieldValue.serverTimestamp() });

  await batch.commit();

  return NextResponse.json({ ok: true });
}
