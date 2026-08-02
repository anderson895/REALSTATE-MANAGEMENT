/**
 * End-to-end registration test against the running Portal.
 *
 *   node --env-file=.env.local --import tsx scripts/smoke-register.ts
 *
 * Registers a real buyer through /api/auth/register, verifies the three
 * records it should create, signs in with the new credentials, and then
 * removes everything it made.
 *
 * Requires: the portal running on port 3000.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

// Fixed so a failed run leaves a predictable record to clean up by hand.
const USERNAME = 'smoketestbuyer';
const EMAIL = 'smoketestbuyer@example.com';
const PASSWORD = 'Sfsr@2026test';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

const validPayload = {
  firstName: 'Juan',
  middleName: 'Santos',
  lastName: 'Dela Cruz',
  suffix: 'Jr.',
  dateOfBirth: '1995-04-12',
  sex: 'Male',
  mobile: '0917 810 2222',
  email: EMAIL,
  username: USERNAME,
  password: PASSWORD,
  confirmPassword: PASSWORD,
  // With RECAPTCHA_DISABLED=true in development the token is not checked.
  // Against a configured server this test would need a real token, which is
  // the point — see the reCAPTCHA test-key note in the README.
  recaptchaToken: 'test-token',
  certifyTruthful: true,
  acceptTerms: true,
  dataPrivacyConsent: true,
};

async function post(body: unknown) {
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function cleanup(): Promise<void> {
  const auth = getAuth();
  const db = getFirestore();
  try {
    const user = await auth.getUserByEmail(EMAIL);
    await db.collection('clients').doc(user.uid).delete().catch(() => undefined);
    await auth.deleteUser(user.uid);
  } catch {
    /* nothing to remove */
  }
  await db.collection('usernames').doc(USERNAME).delete().catch(() => undefined);
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
  await cleanup(); // in case a previous run died mid-way

  console.log('Portal registration smoke test\n');

  console.log('── Validation is enforced server-side ──');
  const weak = await post({ ...validPayload, password: 'weak', confirmPassword: 'weak' });
  check('weak password rejected', weak.status === 400);

  const mismatch = await post({ ...validPayload, confirmPassword: 'Different@123' });
  check('password mismatch rejected', mismatch.status === 400);
  check(
    'error attached to confirmPassword',
    (mismatch.body.fieldErrors as Record<string, string>)?.confirmPassword !== undefined,
  );

  const minor = await post({ ...validPayload, dateOfBirth: '2015-01-01' });
  check('under-18 rejected', minor.status === 400);

  const noConsent = await post({ ...validPayload, dataPrivacyConsent: false });
  check('missing RA 10173 consent rejected', noConsent.status === 400);

  const badUsername = await post({ ...validPayload, username: 'no' });
  check('short username rejected', badUsername.status === 400);

  const badMobile = await post({ ...validPayload, mobile: '12345' });
  check('invalid PH mobile rejected', badMobile.status === 400);

  const noToken = await post({ ...validPayload, recaptchaToken: '' });
  check('missing CAPTCHA token rejected', noToken.status === 400);

  // ── Is the CAPTCHA actually enforced on this server? ──
  //
  // The forged token below is what the old decorative checkbox amounted to:
  // a client claiming "I am human" with nothing backing it. A server with
  // real reCAPTCHA keys must reject it.
  console.log('\n── CAPTCHA enforcement ──');
  const forged = await post({ ...validPayload, recaptchaToken: 'i-am-definitely-a-human' });
  const enforced = forged.body.captchaFailed === true;

  if (enforced) {
    check('forged CAPTCHA token rejected by Google', forged.status === 400);
    console.log('\n  reCAPTCHA is LIVE on this server, so the account-creation');
    console.log('  assertions below cannot run — they would need a real token');
    console.log('  minted by a browser. To exercise the full flow, restart the');
    console.log('  portal with RECAPTCHA_DISABLED=true (development only).');
    console.log('\n─────────────────────────────────────────');
    console.log(`${passed} passed, ${failed} failed  (CAPTCHA enforced — full flow skipped)`);
    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log('  reCAPTCHA is BYPASSED (RECAPTCHA_DISABLED=true) — running the full flow.');

  console.log('\n── Happy path ──');
  const created = await post(validPayload);
  check('account created', created.status === 200 && created.body.ok === true);
  const uid = String(created.body.uid ?? '');

  console.log('\n── Records written ──');
  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUser(uid).catch(() => null);
  check('firebase auth user exists', user !== null);
  check('claim kind=client', user?.customClaims?.kind === 'client');
  check('claim tier=INITIAL', user?.customClaims?.tier === 'INITIAL', String(user?.customClaims?.tier));

  const profile = await db.collection('clients').doc(uid).get();
  const data = profile.data() ?? {};
  check('client profile written', profile.exists);
  check('mobile normalised to 09XXXXXXXXX', data.mobile === '09178102222', String(data.mobile));
  check('no password stored', !('password' in data));
  check('RA 10173 consent recorded', (data.consent as Record<string, unknown>)?.dataPrivacyAct === true);

  const index = await db.collection('usernames').doc(USERNAME).get();
  check('username index written', index.exists);
  check('index points at the client', index.data()?.uid === uid);

  console.log('\n── The new account can actually sign in ──');
  const resolved = await fetch(`${BASE}/api/auth/resolve-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME }),
  });
  const { email } = (await resolved.json()) as { email: string };
  check('username resolves to the registered email', email === EMAIL, email);

  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const signInBody = (await signIn.json()) as { idToken?: string };
  check('firebase sign-in succeeds', typeof signInBody.idToken === 'string');

  const session = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: signInBody.idToken }),
  });
  const sessionBody = (await session.json()) as { tier?: string };
  check('portal session issued', session.ok);
  check('session tier=INITIAL', sessionBody.tier === 'INITIAL', String(sessionBody.tier));

  console.log('\n── Duplicate protection ──');
  const dupe = await post(validPayload);
  check('duplicate username rejected', dupe.status === 409);

  console.log('\n── Cleanup ──');
  await cleanup();
  const gone = await db.collection('usernames').doc(USERNAME).get();
  check('test records removed', !gone.exists);

  console.log('\n─────────────────────────────────────────');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch(async (e: unknown) => {
  console.error('ERROR:', (e as Error).message);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
