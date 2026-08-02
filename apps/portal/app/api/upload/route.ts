import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  createUploadTicket,
  type AssetKind,
} from '@sfsr/infrastructure/server';
import { getClientSession } from '@/lib/session';

/**
 * Issues a one-shot, signed Cloudinary upload ticket.
 *
 * The browser never holds a Cloudinary credential. It describes the file it
 * wants to upload; this route decides where the file may go and signs exactly
 * that. Cloudinary rejects an upload whose parameters do not match the
 * signature (Development Plan.md §2.4).
 *
 * The public_id is derived from the CALLER's uid, not from the request, so a
 * ticket cannot be aimed at another buyer's folder.
 */

const ALLOWED_KINDS: readonly AssetKind[] = ['reservation-payment', 'client-document'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  let body: { kind?: unknown; slug?: unknown; mimeType?: unknown; sizeBytes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const kind = body.kind as AssetKind;
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unsupported upload type.' }, { status: 400 });
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

  const ticket = createUploadTicket(kind, session.uid, String(body.slug ?? 'file'));
  return NextResponse.json(ticket);
}
