import { NextResponse, type NextRequest } from 'next/server';
import { can } from '@sfsr/domain';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  createUploadTicket,
} from '@sfsr/infrastructure/server';
import { getEmployeeSession, toActor } from '@/lib/session';

/**
 * Signed Cloudinary upload ticket for an ANNOUNCEMENT image.
 *
 * The third of these in the codebase, and the only one that signs a PUBLIC
 * asset. `apps/portal/app/api/upload` files a buyer's own documents; the sibling
 * at `apps/internal/app/api/upload` files a buyer's documents on their behalf at
 * the walk-in counter. Both put the result on `type: 'authenticated'`, behind a
 * short-lived signed URL, because a government ID on a public CDN is not
 * defensible under the Data Privacy Act.
 *
 * This one is different in kind, not in degree: an advertisement's whole
 * purpose is to be looked at. It lands on `type: 'upload'` — the public CDN —
 * exactly like the project renders `scripts/seed/upload-media.ts` already puts
 * there.
 *
 * ── Why it is a separate route rather than a branch in the other one ──────
 *
 * Because the two answer different questions. The walk-in route asks "may this
 * employee raise a reservation, and does the buyer they named exist"; this one
 * asks "is this Marketing". Merging them would put a public-CDN branch inside
 * the route that handles government IDs, one `kind` value away from filing a
 * driver's licence somewhere anyone can fetch it. Kept apart, that mistake has
 * nowhere to happen.
 *
 * ── What bounds it ───────────────────────────────────────────────────────
 *
 *  1. An employee session, signature and claims re-verified.
 *  2. `create` on ADVERTISEMENT. MARKETING is the only role in the matrix
 *     holding that module at all, so this single check excludes the other nine
 *     including IT_ADMINISTRATOR.
 *  3. IMAGES ONLY. Narrower than `ACCEPTED_MIME_TYPES`, which allows PDF —
 *     nothing here should accept a document, and an announcement renders its
 *     files in an `<img>` regardless.
 *  4. The public_id is derived from the CALLER's employee id, so every asset in
 *     `sfsr/announcements/` is filed under whoever uploaded it. That is a data
 *     trail in the storage layout itself, independent of Firestore.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  if (!can(toActor(session), 'ADVERTISEMENT', 'create')) {
    return NextResponse.json(
      { error: 'Only Marketing can upload announcement images.' },
      { status: 403 },
    );
  }

  let body: { slug?: unknown; mimeType?: unknown; sizeBytes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Checked here as well as in the browser. A client-side check is a courtesy
  // that saves a slow upload; this is the control.
  const mimeType = String(body.mimeType ?? '');
  if (!(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return NextResponse.json(
      { error: 'Accepted image types are JPG, JPEG, PNG and WebP.' },
      { status: 400 },
    );
  }

  const sizeBytes = Number(body.sizeBytes ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 400 });
  }

  const ticket = createUploadTicket(
    'announcement-image',
    session.employeeId,
    String(body.slug ?? 'image'),
  );
  return NextResponse.json(ticket);
}
