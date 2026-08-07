import { createHash, randomInt } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { OTP_LENGTH, OTP_TTL_MS, canResend } from '@sfsr/domain';
import { getAdminAuth, getAdminFirestore, otpEmail, sendMail } from '@sfsr/infrastructure/server';

/**
 * Sends a password-reset code.
 *
 * ── Always answers the same ──────────────────────────────────────────────
 *
 * Whether or not the address belongs to an account, this returns `{ ok: true }`.
 * Anything else turns the endpoint into a membership oracle: type an address,
 * read the response, learn who banks with St. Francis Square Realty. The page
 * that calls it says "if that address is registered, a code is on its way" for
 * the same reason.
 *
 * That property is easy to lose by accident — a stray 404, a different status
 * code on the rate-limit path, even a noticeably faster response. The shape
 * below keeps every branch returning the same body.
 */

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

/** Digits only, uniform, from a CSPRNG. `Math.random()` is not one. */
function generateOtp(): string {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) code += randomInt(0, 10);
  return code;
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  // A malformed body is the one case worth refusing outright — it cannot have
  // come from the form, so nothing is revealed by saying so.
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const { email } = parsed.data;
  const db = getAdminFirestore();
  const ref = db.collection('passwordResetCodes').doc(email);

  try {
    const existing = await ref.get();
    const lastSentAt = existing.data()?.createdAt?.toDate?.() ?? null;

    // Silently done. Telling the caller they are rate-limited would confirm a
    // code was sent, which confirms the account exists.
    if (!canResend(lastSentAt, new Date())) {
      return NextResponse.json({ ok: true });
    }

    // Look the user up AFTER the cooldown check, so a hammering caller cannot
    // use response timing to tell a real address from a fake one.
    const user = await getAdminAuth()
      .getUserByEmail(email)
      .catch(() => null);

    if (!user) return NextResponse.json({ ok: true });

    const code = generateOtp();
    const now = new Date();

    await ref.set({
      // The HASH, never the code. This document is a credential store: anyone
      // who can read it — a leaked backup, an over-broad rule — would
      // otherwise hold a working reset for every pending address.
      codeHash: hashOtp(code),
      uid: user.uid,
      expiresAt: Timestamp.fromDate(new Date(now.getTime() + OTP_TTL_MS)),
      attempts: 0,
      createdAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await sendMail(
      otpEmail({
        to: email,
        code,
        firstName: user.displayName?.split(' ')[0],
        ttlMinutes: Math.round(OTP_TTL_MS / 60_000),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch {
    /*
     * Even a genuine failure answers `ok`.
     *
     * An SMTP outage that returned 500 for real addresses and 200 for unknown
     * ones would leak exactly what the rest of this route is built to hide.
     * The person sees "check your email", finds nothing, and retries — which
     * is a worse minute for them and a far better one for everybody's privacy.
     */
    return NextResponse.json({ ok: true });
  }
}
