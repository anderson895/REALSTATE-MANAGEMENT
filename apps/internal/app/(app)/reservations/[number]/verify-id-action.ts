'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { can } from '@sfsr/domain';

/**
 * Records a re-run of the ID format check.
 *
 * note.txt: "ibalik yung OCR sa internal, dapat maveverify kung tama yung
 * format ng ID na inupload niya."
 *
 * ── Why the OCR runs in the browser and only the verdict comes here ──────
 *
 * The same constraint that put it in the buyer's browser applies again.
 * Uploaded IDs are Cloudinary `authenticated` assets: the URL alone will not
 * open them, and the signed link that does expires in five minutes. Reading the
 * image server-side would mean fetching it back through that link on every
 * check, and running a 5 MB WASM engine inside a serverless function to do
 * work a laptop already does for free.
 *
 * What changes versus the buyer's run is WHO vouches for it. This writes
 * `checkedBy` and `checkedAt`, so the record distinguishes "the buyer's browser
 * reported this" from "Documentation ran it". The first is a hint; the second
 * is a finding by a named member of staff.
 *
 * It is still not a control. A verdict posted from a browser could say
 * anything, which is why it is never allowed to approve or reject a document —
 * it only annotates one. The transition remains a human act behind
 * `processReservation`.
 */

const schema = z.object({
  reservationNumber: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  verdict: z.enum(['match', 'review', 'mismatch']),
  looksLikeId: z.boolean().nullable(),
  idTypeMatch: z.boolean().nullable(),
  detectedId: z.string().trim().max(60).nullable(),
  backSideDistinct: z.boolean().nullable(),
});

export interface RecheckResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function recordIdRecheck(input: unknown): Promise<RecheckResult> {
  // Documentation owns OCR validation in the matrix; `modify` because this
  // writes to the document record rather than merely reading it.
  const session = await requireModule('OCR_VALIDATION');
  if (!can(toActor(session), 'OCR_VALIDATION', 'modify')) {
    return { ok: false, error: 'Your role cannot record an ID check.' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Malformed check result.' };

  const { reservationNumber, documentId, ...verdict } = parsed.data;

  const db = getAdminFirestore();
  const ref = db.collection('documents').doc(documentId);
  const snap = await ref.get();

  // The document id arrives from the page, so it is input. Confirm it really
  // belongs to the reservation being viewed rather than trusting the caller.
  if (!snap.exists || String(snap.data()?.reservationNumber ?? '') !== reservationNumber) {
    return { ok: false, error: 'That document does not belong to this reservation.' };
  }

  await ref.update({
    formatCheck: {
      ...verdict,
      checkedAt: FieldValue.serverTimestamp(),
      checkedBy: session.employeeId,
    },
  });

  revalidatePath(`/reservations/${reservationNumber}`);
  return { ok: true };
}
