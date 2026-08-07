import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { OTP_LENGTH, checkOtp, otpFailureMessage, validatePassword } from '@sfsr/domain';
import { getAdminAuth, getAdminFirestore } from '@sfsr/infrastructure/server';

/**
 * Verifies a reset code and sets the new password.
 *
 * Both halves happen HERE, in one request, rather than handing back a
 * short-lived token for a second call. A token would be a second credential to
 * mint, store, expire and get wrong; the code the person already holds is
 * enough, and consuming it in the same breath as the password change means
 * there is never a window where a verified-but-unused code is lying around.
 *
 * The password is set with the Admin SDK. It is the only way a server can
 * change a Firebase Auth password — the client SDK needs the OLD password or a
 * recent sign-in, and by definition this person has neither.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'Enter the 6-digit code.'),
  newPassword: z.string(),
});

const hashOtp = (code: string) => createHash('sha256').update(code).digest('hex');

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const { email, code, newPassword } = parsed.data;

  // The SAME policy registration uses. Restating it here would let the two
  // drift, and the drift would be silent — a password accepted on this path
  // that the sign-up form would have refused.
  const violations = validatePassword(newPassword);
  if (violations.length > 0) {
    return NextResponse.json({ error: violations[0]!.message }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection('passwordResetCodes').doc(email);

  try {
    /*
     * The attempt counter is incremented inside a TRANSACTION.
     *
     * Read-then-write would let a script fire a hundred guesses in parallel,
     * all reading `attempts: 0` before any of them writes — and the five-guess
     * cap, which is the entire security of a six-digit code, would count to
     * one. The transaction serialises them.
     */
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();

      const record = data
        ? {
            codeHash: String(data.codeHash ?? ''),
            expiresAt: data.expiresAt?.toDate?.() ?? new Date(0),
            attempts: Number(data.attempts ?? 0),
            createdAt: data.createdAt?.toDate?.() ?? new Date(0),
          }
        : null;

      const result = checkOtp(record, hashOtp(code), new Date());

      if (!result.ok) {
        // Only a genuine wrong guess costs an attempt. Charging for an expired
        // or already-locked code would just burn the counter twice.
        if (result.reason === 'mismatch' && snap.exists) {
          tx.update(ref, { attempts: FieldValue.increment(1) });
        }
        return { error: otpFailureMessage(result.reason) } as const;
      }

      // Consumed on success — one use, and no window where a spent code still
      // opens the door.
      tx.delete(ref);
      return { uid: String(data!.uid ?? '') } as const;
    });

    if ('error' in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: 400 });
    }
    if (!outcome.uid) {
      return NextResponse.json({ error: 'That code is not correct.' }, { status: 400 });
    }

    await getAdminAuth().updateUser(outcome.uid, { password: newPassword });

    // Every existing session dies with the old password. Someone resetting
    // because their account was taken over needs the intruder logged out, and
    // that is the common reason to be on this page at all.
    await getAdminAuth().revokeRefreshTokens(outcome.uid);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Could not reset your password. Please try again.' },
      { status: 500 },
    );
  }
}
