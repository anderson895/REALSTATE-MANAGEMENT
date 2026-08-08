'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { EmployeeId, employeePasswordChanged } from '@sfsr/domain';
import { FirestoreAuditLogger, getAdminFirestore } from '@sfsr/infrastructure/server';
import { requireEmployee } from '@/lib/session';

/**
 * Record that an employee has replaced the password they were issued.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * Change the password. That already happened, in the browser, against Firebase
 * directly — the plaintext never reaches this server, which is the same
 * arrangement the sign-in screen uses and the reason there is no password
 * parameter here to leak into a log.
 *
 * This clears `mustChangePassword` on the employee record. The seed sets it on
 * all twenty-nine accounts and User Management sets it on every account it
 * opens, and until now nothing could ever clear it: the flag was written by two
 * writers and read by two screens with no path between them.
 *
 * ── Why it takes no argument ──────────────────────────────────────────────
 *
 * The employee id comes from the verified session cookie, never from the
 * caller. A server action is a public endpoint, and one that accepted an id
 * would let any signed-in employee clear the flag on somebody else's record —
 * quietly asserting that a colleague had rotated a credential they had not.
 */
export async function markPasswordChanged(): Promise<void> {
  const session = await requireEmployee();
  const db = getAdminFirestore();

  await db.collection('employees').doc(session.employeeId).set(
    {
      mustChangePassword: false,
      passwordChangedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  /*
   * Logged, although nobody asked for it.
   *
   * A credential rotation is the kind of event an auditor looks for after the
   * fact — "when did this account last change hands" — and the employee
   * document only ever holds the LATEST answer. The entry carries no password
   * and no hash, just that it happened and whose account it was.
   */
  await new FirestoreAuditLogger(db).record(
    [employeePasswordChanged(new EmployeeId(session.employeeId), new Date())],
    session.employeeId,
  );

  revalidatePath('/profile');
}
