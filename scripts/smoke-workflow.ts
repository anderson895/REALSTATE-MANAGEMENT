/**
 * End-to-end smoke test against the LIVE Firestore.
 *
 *   node --env-file=.env.local --import tsx scripts/smoke-workflow.ts
 *
 * Drives a real reservation through the real adapters — Firestore
 * transactions, mappers, the counter sequence, the audit log — to prove the
 * infrastructure layer behaves the same as the in-memory fakes the unit tests
 * use (Development Plan.md §11.1, Liskov).
 *
 * Cleans up after itself: the reservation, the counter, and the audit entries
 * it created are deleted, and the unit is restored to Available.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ClientId, EmployeeId, ReservationWorkflowService, UnitId } from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  FirestoreReservationRepository,
  FirestoreUnitOfWork,
  FirestoreUnitRepository,
} from '@sfsr/infrastructure/server';

const UNIT = new UnitId('U001');
const CLIENT = new ClientId('smoke-test-client');
const STAFF = new EmployeeId('EMP012');
const SUPERVISOR = new EmployeeId('EMP011');

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(46)} ${String(actual)}`);
  if (ok) passed++;
  else {
    failed++;
    console.log(`        expected: ${String(expected)}`);
  }
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

  const db = getFirestore();
  const units = new FirestoreUnitRepository(db);
  const reservations = new FirestoreReservationRepository(db);
  const workflow = new ReservationWorkflowService(
    units,
    reservations,
    new FirestoreAuditLogger(db),
    new FirestoreUnitOfWork(db),
  );

  console.log(`Smoke test against ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);

  const at = new Date();
  const seeded = await units.findById(UNIT);
  console.log('── Mapper round-trip ────────────────────────────');
  check('unit loaded from Firestore', seeded !== null, true);
  check('purchase price survived as centavos', seeded?.purchasePrice.toCentavos(), 600_000_000);
  check('formats as pesos', seeded?.purchasePrice.format(), '₱6,000,000.00');
  check('tower is null for The Legaspi Place', seeded?.tower, null);
  check('starts Available', seeded?.status, 'Available');

  console.log('\n── Reservation workflow ─────────────────────────');
  const number = await workflow.submit({
    clientId: CLIENT,
    unitId: UNIT,
    parkingSlotId: null,
    salesAgentId: 'AG001',
    terms: { downPaymentTier: 30, paymentTerm: 24, financingOption: 'Bank Financing' },
    at,
  });
  check('reference allocated', /^RES-\d{4}-\d{6}$/.test(number.value), true);
  check('unit still Available after submit', (await units.findById(UNIT))?.status, 'Available');

  await workflow.verifyPayment(number, STAFF, at);
  check('unit On Hold after payment verified', (await units.findById(UNIT))?.status, 'On Hold');

  await workflow.verifyDocuments(number, STAFF, at);
  await workflow.approve(number, SUPERVISOR, true, at);
  check('unit Sold after approval', (await units.findById(UNIT))?.status, 'Sold');
  check('reservation Approved', (await reservations.findByNumber(number))?.status, 'Approved');

  console.log('\n── Guard rails ──────────────────────────────────');
  let blocked = false;
  try {
    await workflow.submit({
      clientId: new ClientId('someone-else'),
      unitId: UNIT,
      parkingSlotId: null,
      salesAgentId: null,
      terms: { downPaymentTier: 10, paymentTerm: 12, financingOption: 'Cash Payment' },
      at,
    });
  } catch {
    blocked = true;
  }
  check('second reservation on a sold unit rejected', blocked, true);

  console.log('\n── Audit trail ──────────────────────────────────');
  const audit = await db.collection('auditLogs').where('payload.reservationNumber', '==', number.value).get();
  const types = audit.docs.map((d) => String(d.data().type)).sort();
  // Six: four reservation transitions plus the two unit events they trigger.
  // The same count the in-memory suite asserts — the fakes and the Firestore
  // adapters are interchangeable, which is the point of the port (§3.10 L).
  check('audit entries written', audit.size, 6);
  console.log(`        ${types.join(', ')}`);

  console.log('\n── Cleanup ──────────────────────────────────────');
  const unit = await units.findById(UNIT);
  unit?.release('smoke test cleanup', at);
  if (unit) await units.save(unit);
  await db.collection('reservations').doc(number.value).delete();
  for (const doc of audit.docs) await doc.ref.delete();
  await db.collection('counters').doc(`reservations-${number.year}`).delete();
  check('unit restored to Available', (await units.findById(UNIT))?.status, 'Available');

  console.log(`\n─────────────────────────────────────────────────`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((error: unknown) => {
  console.error('\nSMOKE TEST ERROR:', (error as Error).message);
  process.exit(1);
});
