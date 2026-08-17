import { NextResponse, type NextRequest } from 'next/server';
import { UNIT_TYPES, canManageMedia } from '@sfsr/domain';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  createProjectMediaTicket,
  getAdminFirestore,
  type MediaSlot,
} from '@sfsr/infrastructure/server';
import { getEmployeeSession, toActor } from '@/lib/session';

/**
 * Signed Cloudinary ticket for a PROJECT or UNIT picture.
 *
 * The fourth upload route in the codebase and the second public one. The two
 * that handle government IDs and receipts put everything on
 * `type: 'authenticated'`; this and the announcement route deal in material
 * whose whole purpose is to be looked at, so both land on the public CDN.
 *
 * ── Why it is separate from the announcement route ───────────────────────
 *
 * They ask different questions and build the `public_id` differently. An
 * announcement image is filed under whoever uploaded it and never replaces
 * anything. A project picture replaces exactly one asset at a FIXED path —
 * the same path `scripts/seed/upload-media.ts` writes — so that a floor plan
 * changed from the browser and one loaded from disk are the same picture
 * rather than two, and the next seed run does not silently undo Marketing's
 * edit.
 *
 * ── What bounds it ───────────────────────────────────────────────────────
 *
 *  1. An employee session, signature and claims re-verified.
 *  2. `canManageMedia` — Marketing alone, by client instruction.
 *  3. IMAGES ONLY. Narrower than ACCEPTED_MIME_TYPES, which permits PDF: a
 *     floor plan is rendered in an `<img>` and a PDF would draw as a broken
 *     box on the buyer's screen.
 *  4. The project, and the unit, must EXIST. The path is built from those ids,
 *     so accepting one that does not would let a caller write to an arbitrary
 *     folder in the account and leave an orphan nothing will ever show.
 *  5. The unit must belong to the project it is claimed under, or the photo
 *     would file under one project and display under another.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  if (!canManageMedia(toActor(session))) {
    return NextResponse.json(
      { error: 'Only Marketing can change project and unit pictures.' },
      { status: 403 },
    );
  }

  let body: {
    projectId?: unknown;
    slot?: unknown;
    unitType?: unknown;
    unitId?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
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

  const projectId = String(body.projectId ?? '').trim();
  if (!projectId) {
    return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const project = await db.collection('projects').doc(projectId).get();
  if (!project.exists) {
    return NextResponse.json({ error: 'That project does not exist.' }, { status: 404 });
  }

  const slotName = String(body.slot ?? '');
  let slot: MediaSlot;

  switch (slotName) {
    case 'hero':
      slot = { kind: 'hero' };
      break;

    case 'amenities':
      slot = { kind: 'amenities' };
      break;

    case 'floorPlan': {
      const unitType = String(body.unitType ?? '');
      // Matched against the canonical list rather than accepted as text: the
      // type becomes a folder name AND the key the portal looks a plan up by,
      // so a typo would file a picture nothing can find.
      if (!(UNIT_TYPES as readonly string[]).includes(unitType)) {
        return NextResponse.json({ error: 'Unknown unit type.' }, { status: 400 });
      }
      slot = { kind: 'floorPlan', unitType };
      break;
    }

    case 'unitPhoto': {
      const unitId = String(body.unitId ?? '').trim();
      if (!unitId) {
        return NextResponse.json({ error: 'Unit is required.' }, { status: 400 });
      }
      const unit = await db.collection('units').doc(unitId).get();
      if (!unit.exists) {
        return NextResponse.json({ error: 'That unit does not exist.' }, { status: 404 });
      }
      if (String(unit.data()?.projectId ?? '') !== projectId) {
        return NextResponse.json(
          { error: 'That unit belongs to a different project.' },
          { status: 400 },
        );
      }
      slot = { kind: 'unitPhoto', unitId };
      break;
    }

    default:
      return NextResponse.json({ error: 'Unknown picture type.' }, { status: 400 });
  }

  return NextResponse.json(createProjectMediaTicket(projectId, slot));
}
