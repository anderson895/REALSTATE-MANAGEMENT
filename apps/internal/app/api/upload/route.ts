import { NextResponse, type NextRequest } from 'next/server';
import { can } from '@sfsr/domain';
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  createUploadTicket,
  getAdminFirestore,
  type AssetKind,
} from '@sfsr/infrastructure/server';
import { getEmployeeSession, toActor } from '@/lib/session';

/**
 * Signed Cloudinary upload ticket for a WALK-IN reservation.
 *
 * The Portal has its own version of this at `apps/portal/app/api/upload`. The
 * two look alike and differ on the one thing that matters: who the caller is,
 * and whose folder the file is allowed to land in.
 *
 * ── Why this is a second route and not a shared one ───────────────────────
 *
 * On the Portal the folder is derived from the caller's own uid — "the
 * public_id is derived from the CALLER's uid, not from the request, so a
 * ticket cannot be aimed at another buyer's folder". That rule is the whole
 * security model there, and it is exactly the rule a walk-in has to break: an
 * agent at the counter is uploading the BUYER's receipt and the BUYER's ID
 * into the BUYER's folder, on their behalf.
 *
 * Filing them under the agent instead would put a buyer's documents somewhere
 * they can never see them, and break `signedUrlFor` for the verification
 * screens, which expect a client-owned path. So the target uid comes from the
 * request — and everything below exists to bound what that allows.
 *
 * ── What bounds it ───────────────────────────────────────────────────────
 *
 *  1. An employee session. `proxy.ts` already refuses this path without a
 *     session cookie; this re-checks the signature and the employee claim.
 *  2. `create` on RESERVATION_VERIFICATION — the walk-in grant. Documentation
 *     holds it as part of FULL; Billing does not, and neither does IT.
 *  3. The target must be an EXISTING client. A typo cannot create a stray
 *     folder, and a uid picked at random will not resolve.
 *  4. The `documents` record written afterwards carries `uploadedBy` set to
 *     the employee, so a staff upload is never mistaken for the buyer's own.
 *
 * KNOWN LIMIT, stated rather than hidden: a Sales Agent may aim an upload at
 * any existing buyer's folder, not only the one they are serving. Bounding it
 * further would need the walk-in draft to exist server-side first, so the
 * ticket could be checked against it. Writing is all this allows — reading is
 * a separate signed URL — and every write is attributable.
 */

const ALLOWED_KINDS: readonly AssetKind[] = ['reservation-payment', 'client-document'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  if (!can(toActor(session), 'RESERVATION_VERIFICATION', 'create')) {
    // Verifying a reservation and raising one are different grants. A Billing
    // clerk can clear a payment and still has no business filing documents.
    return NextResponse.json(
      { error: 'Your role cannot raise a walk-in reservation.' },
      { status: 403 },
    );
  }

  let body: {
    kind?: unknown;
    buyerUid?: unknown;
    slug?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const kind = body.kind as AssetKind;
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unsupported upload type.' }, { status: 400 });
  }

  const buyerUid = String(body.buyerUid ?? '').trim();
  if (!buyerUid) {
    return NextResponse.json(
      { error: 'Select the buyer before uploading their documents.' },
      { status: 400 },
    );
  }

  // COST: 1 read. Confirms the folder about to be signed belongs to somebody.
  const buyer = await getAdminFirestore().collection('clients').doc(buyerUid).get();
  if (!buyer.exists) {
    return NextResponse.json({ error: 'That buyer no longer exists.' }, { status: 404 });
  }

  // Checked here as well as in the browser. A client-side size check is a
  // courtesy that saves a slow upload; this is the control.
  const mimeType = String(body.mimeType ?? '');
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return NextResponse.json(
      { error: 'Accepted file types are PDF, JPG, JPEG and PNG.' },
      { status: 400 },
    );
  }

  const sizeBytes = Number(body.sizeBytes ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 400 });
  }

  const ticket = createUploadTicket(kind, buyerUid, String(body.slug ?? 'file'));
  return NextResponse.json(ticket);
}
