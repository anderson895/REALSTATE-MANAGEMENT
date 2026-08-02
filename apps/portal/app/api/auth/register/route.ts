import { NextResponse, type NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeMobile } from '@sfsr/domain';
import { getAdminAuth, getAdminFirestore, verifyCaptcha } from '@sfsr/infrastructure/server';
import { registrationSchema } from '@/lib/schemas/registration';

/**
 * Creates an Initial Account for a prospective buyer.
 *
 * RESERVATION.doc: "Upon successful registration, the system validates the
 * submitted information and creates an Initial Account, enabling users to
 * schedule property trippings, submit reservation applications, upload
 * documentary requirements and proof of payment, and monitor their
 * reservation status."
 *
 * Three records are written together — the Auth user, the client profile, and
 * the private username index. If any step fails the earlier ones are undone,
 * because a half-registered account is worse than none: the username would be
 * taken but unusable, and the buyer could never sign in or re-register.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Re-validated here even though the form already checked. Client-side
  // validation is a convenience; this is the control (§3.3).
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return NextResponse.json({ error: 'Please check the form.', fieldErrors }, { status: 400 });
  }

  const data = parsed.data;

  // Verified BEFORE anything is created. A bot that gets past this has done
  // real work; one that does not costs us a single outbound request.
  const captcha = await verifyCaptcha(
    data.recaptchaToken,
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  );
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.reason ?? 'CAPTCHA verification failed.', captchaFailed: true },
      { status: 400 },
    );
  }

  const username = data.username.trim().toLowerCase();
  const email = data.email.trim().toLowerCase();
  const mobile = normalizeMobile(data.mobile);

  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Username uniqueness. Checked before creating anything so the common
  // "that name is taken" case does not leave an orphaned Auth user behind.
  const existing = await db.collection('usernames').doc(username).get();
  if (existing.exists) {
    return NextResponse.json(
      { error: 'That username is already taken.', fieldErrors: { username: 'Already taken.' } },
      { status: 409 },
    );
  }

  let uid: string | undefined;
  try {
    const user = await auth.createUser({
      email,
      password: data.password,
      displayName: [data.firstName, data.lastName].join(' ').trim(),
    });
    uid = user.uid;

    // What proxy.ts and the Security Rules read. INITIAL, never PERMANENT —
    // that upgrade is made by Documentation Staff once the Contract to Sell
    // is signed (RESERVATION.doc).
    //
    // `username` rides along so the sidebar can greet the buyer by name
    // without a Firestore read on every page. The display name arrives via the
    // standard `name` claim, populated from displayName above.
    await auth.setCustomUserClaims(uid, { kind: 'client', tier: 'INITIAL', username });

    await db
      .collection('clients')
      .doc(uid)
      .set({
        uid,
        username,
        email,
        firstName: data.firstName.trim(),
        middleName: data.middleName?.trim() || null,
        lastName: data.lastName.trim(),
        suffix: data.suffix?.trim() || null,
        dateOfBirth: data.dateOfBirth,
        sex: data.sex,
        mobile,
        tier: 'INITIAL',
        // Consent is evidence under RA 10173: record WHAT was agreed and WHEN,
        // not merely that a box was ticked.
        consent: {
          certifiedTruthful: true,
          acceptedTerms: true,
          dataPrivacyAct: true,
          acceptedAt: FieldValue.serverTimestamp(),
        },
        createdAt: FieldValue.serverTimestamp(),
      });

    // Private index — unreadable from any browser, which is what makes
    // username sign-in possible without exposing the account list (§5.2).
    await db.collection('usernames').doc(username).set({ email, uid, kind: 'client' });

    return NextResponse.json({ ok: true, uid, email });
  } catch (error) {
    // Roll back so the buyer can simply try again.
    if (uid) {
      await auth.deleteUser(uid).catch(() => undefined);
      await db.collection('clients').doc(uid).delete().catch(() => undefined);
    }
    await db.collection('usernames').doc(username).delete().catch(() => undefined);

    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return NextResponse.json(
        {
          error: 'An account with that email address already exists.',
          fieldErrors: { email: 'Already registered.' },
        },
        { status: 409 },
      );
    }
    if (code === 'auth/invalid-password') {
      return NextResponse.json(
        { error: 'Password rejected.', fieldErrors: { password: 'Password is too weak.' } },
        { status: 400 },
      );
    }

    console.error('Registration failed:', error);
    return NextResponse.json(
      { error: 'Could not create your account. Please try again.' },
      { status: 500 },
    );
  }
}
