/**
 * End-to-end reservation submission against the running Portal.
 *
 *   node --env-file=.env.local --import tsx scripts/smoke-reservation.ts
 *
 * Registers a buyer, submits a full reservation through /api/reservations,
 * and verifies the reference number, the reservation record, the payment
 * record, the document record, the audit trail, and that the unit is NOT yet
 * held — RESERVATION.doc places the hold at payment verification, not at
 * submission. Cleans up everything it creates.
 *
 * Requires: the portal running on port 3000.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

const USERNAME = 'reservesmoke';
const EMAIL = 'reservesmoke@example.com';
const PASSWORD = 'Sfsr@2026test';
const UNIT_ID = 'EU002'; // Emerald Park studio, ₱6,000,000

let passed = 0;
let failed = 0;
let createdRef: string | null = null;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
}

async function cleanup(): Promise<void> {
  const auth = getAuth();
  const db = getFirestore();

  if (createdRef) {
    await db.collection('reservations').doc(createdRef).delete().catch(() => undefined);
    for (const col of ['payments', 'documents']) {
      const snap = await db.collection(col).where('reservationNumber', '==', createdRef).get();
      for (const doc of snap.docs) await doc.ref.delete().catch(() => undefined);
    }
    const audit = await db
      .collection('auditLogs')
      .where('payload.reservationNumber', '==', createdRef)
      .get();
    for (const doc of audit.docs) await doc.ref.delete().catch(() => undefined);
    await db.collection('counters').doc(`reservations-${new Date().getFullYear()}`).delete().catch(() => undefined);
  }

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
  initAdmin();
  await cleanup();

  const db = getFirestore();
  console.log('Reservation submission smoke test\n');

  // ── Register and sign in ──
  await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Pedro', middleName: '', lastName: 'Reyes', suffix: '',
      dateOfBirth: '1990-02-20', sex: 'Male', mobile: '09178105555', email: EMAIL,
      username: USERNAME, password: PASSWORD, confirmPassword: PASSWORD,
      recaptchaToken: 'test-token', certifyTruthful: true, acceptTerms: true,
      dataPrivacyConsent: true,
    }),
  });

  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const { idToken } = (await signIn.json()) as { idToken: string };

  if (!idToken) {
    console.log(
      '\n  Could not register a test buyer. reCAPTCHA is enforced on this server,\n' +
        '  and this test cannot mint a real token. Restart the portal with\n' +
        '  RECAPTCHA_DISABLED=true (development only) to run the full flow.',
    );
    await cleanup();
    process.exit(1);
  }

  const sessionResponse = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const cookie = (sessionResponse.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  check('buyer registered and signed in', sessionResponse.ok);

  // ── The signed upload ticket ──
  console.log('\n── Signed upload ──');
  const ticketResponse = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ kind: 'client-document', slug: 'government-id', mimeType: 'image/png', sizeBytes: 2048 }),
  });
  const ticket = (await ticketResponse.json()) as { signature?: string; publicId?: string; type?: string };
  check('ticket issued', ticketResponse.ok && typeof ticket.signature === 'string');
  check('delivery type is authenticated', ticket.type === 'authenticated', String(ticket.type));

  const oversize = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ kind: 'client-document', slug: 'x', mimeType: 'image/png', sizeBytes: 11 * 1024 * 1024 }),
  });
  check('11 MB rejected server-side', oversize.status === 400);

  const badType = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ kind: 'client-document', slug: 'x', mimeType: 'application/zip', sizeBytes: 2048 }),
  });
  check('.zip rejected server-side', badType.status === 400);

  // ── Submit ──
  console.log('\n── Reservation submission ──');
  const application = {
    unitId: UNIT_ID,
    parkingSlotId: '',
    civilStatus: 'Single', nationality: 'Filipino', tin: '123-456-789',
    mobile: '09178105555',
    houseNo: '12', street: 'Rizal Avenue', barangay: 'San Antonio',
    city: 'Parañaque City', province: 'Metro Manila', zipCode: '1700',
    downPaymentTier: 30, paymentTerm: 24, financingOption: 'Bank Financing', salesAgentId: 'AG001',
    payment: {
      paymentDate: '2026-08-03',
      referenceNumber: 'BDO-2026-778899',
      channel: 'Bank Deposit',
      amountCentavos: 5_000_000,
      receipt: { publicId: 'sfsr/test/receipt', fileName: 'receipt.png', mimeType: 'image/png', sizeBytes: 2048 },
    },
    governmentId: {
      idType: "Driver's License",
      file: { publicId: 'sfsr/test/id', fileName: 'id.png', mimeType: 'image/png', sizeBytes: 4096 },
    },
    acceptedTerms: true,
    declaredTruthful: true, declaredReviewed: true, declaredNotAutomatic: true,
    declaredSubjectToVerification: true, declaredAgreed: true,
  };

  // Missing declarations must be refused.
  const incomplete = await fetch(`${BASE}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ ...application, declaredAgreed: false }),
  });
  check('incomplete declaration rejected', incomplete.status === 400);

  const submitted = await fetch(`${BASE}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(application),
  });
  const result = (await submitted.json()) as { ok?: boolean; reservationNumber?: string; error?: string };
  check('reservation accepted', submitted.ok === true && result.ok === true, result.error ?? '');
  createdRef = result.reservationNumber ?? null;
  check('reference matches RES-YYYY-NNNNNN', /^RES-\d{4}-\d{6}$/.test(createdRef ?? ''), createdRef ?? '');

  // ── Records ──
  console.log('\n── What was written ──');
  const reservation = await db.collection('reservations').doc(createdRef!).get();
  const data = reservation.data() ?? {};
  check('reservation stored', reservation.exists);
  check('status is Pending Payment Verification', data.status === 'PendingPaymentVerification', String(data.status));
  check('down payment tier recorded', data.downPaymentTier === 30);
  check('address captured', data.buyer?.address?.city === 'Parañaque City');
  check('declarations recorded as evidence', data.declarations?.truthful === true);

  const payment = await db.collection('payments').where('reservationNumber', '==', createdRef).get();
  check('payment record created', payment.size === 1);
  check(
    'payment awaits verification',
    payment.docs[0]?.data().status === 'Pending Verification',
    String(payment.docs[0]?.data().status),
  );

  const documents = await db.collection('documents').where('reservationNumber', '==', createdRef).get();
  check('government ID recorded', documents.size === 1);
  check('ID awaits validation', documents.docs[0]?.data().status === 'Pending Validation');

  const unit = await db.collection('units').doc(UNIT_ID).get();
  check(
    'unit still Available — the hold comes at payment verification',
    unit.data()?.status === 'Available',
    String(unit.data()?.status),
  );

  const audit = await db.collection('auditLogs').where('payload.reservationNumber', '==', createdRef).get();
  check('audit entry written', audit.size >= 1, `${audit.size} entries`);

  // ── Cleanup ──
  console.log('\n── Cleanup ──');
  await cleanup();
  const gone = await db.collection('reservations').doc(createdRef!).get();
  check('test data removed', !gone.exists);

  console.log('\n─────────────────────────────────────────');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch(async (e: unknown) => {
  console.error('ERROR:', (e as Error).message);
  initAdmin();
  await cleanup().catch(() => undefined);
  process.exit(1);
});
