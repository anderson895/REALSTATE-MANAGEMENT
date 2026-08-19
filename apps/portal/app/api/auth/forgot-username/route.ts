import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canResend } from '@sfsr/domain';
import {
  findClientUsernamesByEmail,
  getAdminAuth,
  getAdminFirestore,
  sendMail,
  usernameReminderEmail,
} from '@sfsr/infrastructure/server';

/**
 * Emails a buyer the username registered to their address.
 *
 * comments.doc: "Do we have password retrieval pag nakalimutan ni prospect
 * buyer/buyer ang password? Need kasi din sya. Para no need gumawa ng another
 * account because nakalimutan lang ang password same din sa username."
 *
 * Password reset already existed at /api/auth/forgot-password. This is the
 * other half, and it is the half that was actually blocking people: sign-in
 * takes a USERNAME, so someone who has forgotten theirs cannot complete a
 * password reset either — they would finish the reset and still be stuck at the
 * first field. The duplicate account the client is worried about is what
 * happens next.
 *
 * ── Always answers the same ──────────────────────────────────────────────
 *
 * `{ ok: true }`, whatever is typed and whatever goes wrong. Deliberately
 * modelled on the forgot-password route beside it, because the same reasoning
 * applies with more force: this endpoint's whole job is to hand back a
 * username, and any variation in the reply — a 404, a different status on the
 * rate-limited path, a noticeably faster response — would let someone feed it
 * addresses and harvest the usernames of St. Francis Square Realty's buyers.
 *
 * The username itself is never in the response body. It goes to the mailbox, so
 * that learning it requires already being able to read that mailbox.
 *
 * ── Staff are not reachable through this ─────────────────────────────────
 *
 * `findClientUsernamesByEmail` drops employees. Staff credentials are I.T's to
 * maintain, and this must not become a way to try company addresses and find
 * out which ones have accounts.
 */

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  // A malformed body cannot have come from the form, so refusing it reveals
  // nothing — the same exception the password route makes.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const { email } = parsed.data;
  const db = getAdminFirestore();

  /*
   * A cooldown doc per address, in its own collection.
   *
   * Not `passwordResetCodes`: that holds live credentials keyed by the same id,
   * and writing a reminder timestamp into it would clobber a reset code the
   * person is in the middle of using. Sealed from browsers in firestore.rules
   * exactly like its neighbour — the document id is an email address, so a
   * readable copy would be an enumeration index on its own.
   */
  const ref = db.collection('usernameReminders').doc(email);

  try {
    const existing = await ref.get();
    const lastSentAt = existing.data()?.createdAt?.toDate?.() ?? null;

    // Silently done. Saying "you are rate-limited" confirms an email went out,
    // which confirms the account exists.
    if (!canResend(lastSentAt, new Date())) {
      return NextResponse.json({ ok: true });
    }

    const usernames = await findClientUsernamesByEmail(email);
    if (usernames.length === 0) return NextResponse.json({ ok: true });

    // Only for the greeting. A failure here must not stop the send.
    const user = await getAdminAuth()
      .getUserByEmail(email)
      .catch(() => null);

    await ref.set({
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await sendMail(
      usernameReminderEmail({
        to: email,
        usernames,
        firstName: user?.displayName?.split(' ')[0],
        signInUrl: new URL('/login', request.nextUrl.origin).toString(),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch {
    // Even a genuine failure answers ok — an SMTP outage that returned 500 for
    // real addresses and 200 for unknown ones would leak precisely what the
    // rest of this route is built to hide.
    return NextResponse.json({ ok: true });
  }
}
