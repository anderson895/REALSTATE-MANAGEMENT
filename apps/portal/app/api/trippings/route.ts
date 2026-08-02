import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { clientCan } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { getClientSession } from '@/lib/session';

/**
 * Records a site viewing request.
 *
 * "request tripping" is an Initial Account capability in RESERVATION.doc, so
 * the tier is re-checked here rather than trusted from the page that rendered
 * the form — the page is a convenience, this is the control (§3.3).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }
  if (!clientCan(session.tier, 'requestTripping')) {
    return NextResponse.json({ error: 'Not available on this account.' }, { status: 403 });
  }

  let body: { projectId?: unknown; preferredDate?: unknown; preferredTime?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const preferredDate = typeof body.preferredDate === 'string' ? body.preferredDate : '';

  if (!projectId || !preferredDate) {
    return NextResponse.json({ error: 'Project and preferred date are required.' }, { status: 400 });
  }

  const db = getAdminFirestore();

  // Confirm the project exists rather than storing whatever id was posted —
  // a request against a nonexistent project would sit in the Sales queue
  // looking valid.
  const project = await db.collection('projects').doc(projectId).get();
  if (!project.exists) {
    return NextResponse.json({ error: 'Unknown project.' }, { status: 400 });
  }

  // A date in the past wastes an agent's callback.
  const requested = new Date(preferredDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(requested.getTime()) || requested < today) {
    return NextResponse.json({ error: 'Choose a date from today onwards.' }, { status: 400 });
  }

  await db.collection('trippings').add({
    clientId: session.uid,
    clientName: session.displayName,
    projectId,
    projectName: String(project.data()?.name ?? projectId),
    preferredDate,
    preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime : null,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
    status: 'Requested',
    requestedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
