/**
 * Loads the extracted JSON fixtures into Firestore and Firebase Auth.
 *
 *   node --env-file=.env.local --import tsx scripts/seed/load.ts [--dry-run]
 *
 * Idempotent: every write is keyed by the source id and uses merge, so running
 * it twice produces the same database rather than duplicates.
 *
 * Run `npm run seed:extract` first — this reads scripts/seed/data/*.json and
 * never touches the .xls workbooks.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { internalEmailFor, resolveRoleFromSheet } from '@sfsr/domain';
import { recomputeStats } from './recompute-stats';

const DATA_DIR = join(import.meta.dirname, 'data');
const DRY_RUN = process.argv.includes('--dry-run');

interface ProjectFixture {
  id: string;
  name: string;
  code: string;
  developer: string;
  location: string;
  buildingType: string;
  floorsRaw: string;
  theme: string;
}
interface UnitFixture {
  id: string;
  projectId: string;
  tower: string | null;
  floor: number;
  unitNo: string;
  unitType: string;
  areaSqm: number;
  pricePerSqmCentavos: number;
  purchasePriceCentavos: number;
  status: string;
}
interface ParkingFixture {
  id: string;
  projectId: string;
  tower: string | null;
  level: string;
  parkingNo: string;
  parkingType: string;
  areaSqm: number;
  purchasePriceCentavos: number;
  status: string;
}
interface EmployeeFixture {
  id: string;
  fullName: string;
  department: string;
  position: string;
  username: string;
  seedPassword: string;
  userRole: string;
  status: string;
  isSupervisor: boolean;
  sourceSheet: string;
}

function load<T>(file: string): T[] {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8')) as T[];
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

/** Firestore caps a batch at 500 writes. */
async function writeAll(
  db: Firestore,
  collection: string,
  records: ReadonlyArray<{ id: string } & Record<string, unknown>>,
): Promise<number> {
  if (DRY_RUN) return records.length;

  let written = 0;
  for (let i = 0; i < records.length; i += 400) {
    const batch = db.batch();
    for (const record of records.slice(i, i + 400)) {
      const { id, ...rest } = record;
      batch.set(db.collection(collection).doc(id), { ...rest, seededAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
    written += Math.min(400, records.length - i);
  }
  return written;
}

async function seedInventory(db: Firestore): Promise<void> {
  console.log('\n── Inventory ────────────────────────────────────');

  const projects = load<ProjectFixture>('projects.json');
  console.log(`  projects       ${await writeAll(db, 'projects', projects)}`);

  const units = load<UnitFixture>('units.json');
  console.log(`  units          ${await writeAll(db, 'units', units.map((u) => ({ ...u, currentReservation: null })))}`);

  const parking = load<ParkingFixture>('parking-slots.json');
  console.log(`  parkingSlots   ${await writeAll(db, 'parkingSlots', parking)}`);
}

async function seedSalesOrg(db: Firestore): Promise<void> {
  console.log('\n── Sales organisation ───────────────────────────');
  for (const [file, kind] of [
    ['group-heads.json', 'groupHead'],
    ['brokers.json', 'broker'],
    ['agents.json', 'agent'],
  ] as const) {
    const records = load<{ id: string }>(file).map((r) => ({ ...r, kind }));
    console.log(`  ${kind.padEnd(13)}${await writeAll(db, 'salesOrg', records)}`);
  }
}

/**
 * Hand-maintained fixtures for the departments RBAC.xls has no sheet for.
 *
 * ── Why these exist at all ──────────────────────────────────────────
 *
 * `employees.json` is GENERATED — `npm run seed:extract` rebuilds it from the
 * personnel sheets in RBAC.xls, so anything written into it by hand disappears
 * on the next run. Two roles have no sheet to be generated FROM:
 *
 *   SALES     — the workbook covers Accounting, Billing, Cash, Documentation,
 *               IT, Legal, Loans and Receivables, and Sales is simply absent,
 *               which is why no sales agent could sign in. note.txt asks for
 *               exactly that: "gawan ng login credentials si sales agent".
 *   MARKETING — has a row in USER ROLE ACCESS and no personnel sheet at all:
 *               the Advertisement module belongs to a role with zero seedable
 *               accounts (Development Plan.md §12, finding 12).
 *
 * Neither sheet could be added programmatically. ACE.OLEDB refuses CREATE TABLE
 * against legacy .xls, and rewriting the workbook through xlrd/xlwt produces a
 * file ACE.OLEDB then declines to read at all — which broke the extract
 * entirely until the backup went back. Adding one needs Excel itself.
 *
 * ── Marketing is seeded AND creatable from the interface ────────────
 *
 * These are not alternatives. /admin/users is how a Marketing account is
 * created in a running system, and EMP030 was created exactly that way — the
 * fixture is a transcript of it, so a database reset does not cost the account
 * and a demo does not start with the Advertisement module locked out.
 *
 * Its `seedPassword` is therefore the GENERATED one that /admin/users handed
 * over on screen, not a tidy `Mktg@123`. That is the point: the account already
 * exists in Auth with that password, and `seedPassword` is only ever applied at
 * CREATE (see below), so any other value would be a fixture that documents a
 * credential nobody can sign in with. Both databases now agree — the live one
 * because it was typed there first, a fresh one because this recreates it.
 *
 * A stopgap, and meant to be deleted: the day RBAC.xls carries these sheets,
 * `seed:extract` emits the rows into `employees.json` and these files can go.
 */
const OVERLAY_FILES = ['employees-sales.json', 'marketing.json'] as const;

/**
 * Creates the internal accounts.
 *
 * The plaintext passwords in RBAC.xls are used ONCE here and never stored.
 * Every account carries `mustChangePassword: true` (Development Plan.md §12.3).
 *
 * WATCH OUT: `seedPassword` only applies when the Auth user is CREATED. An
 * account that already exists keeps whatever password it has, so re-running
 * this never resets anybody's credentials. That is deliberate — but it means a
 * fixture whose `seedPassword` was edited after the account existed is
 * describing a password that will not work until the account is deleted and
 * seeded again.
 */
async function seedEmployees(db: Firestore): Promise<void> {
  console.log('\n── Employees ────────────────────────────────────');
  const generated = load<EmployeeFixture>('employees.json');

  // The generated file wins on a collision, and so does an earlier overlay over
  // a later one — so the day RBAC.xls carries these sheets, the overlays quietly
  // stop mattering rather than fighting the generated rows.
  const seen = new Set(generated.map((e) => e.username.toLowerCase()));
  const employees = [...generated];

  for (const file of OVERLAY_FILES) {
    const added = load<EmployeeFixture>(file).filter(
      (e) => !seen.has(e.username.toLowerCase()),
    );
    for (const employee of added) seen.add(employee.username.toLowerCase());
    employees.push(...added);
    console.log(`  ${file.padEnd(22)}${added.length} added`);
  }
  console.log(`  ${generated.length} from RBAC.xls, ${employees.length} in total`);

  const auth = getAuth();

  let created = 0;
  let updated = 0;

  for (const emp of employees) {
    // Same helper User Management uses, so an account added through the
    // interface is addressed exactly like one that came out of the workbook.
    const email = internalEmailFor(emp.username);

    // The Department column cannot drive permissions: nine employees share
    // "Loans Management Department" but split across Documentation, Billing
    // and Loans, which have different rights. The sheet is the only field that
    // separates them (Development Plan.md §12.28).
    const role = resolveRoleFromSheet(emp.sourceSheet);
    if (!role) {
      throw new Error(
        `Cannot resolve an RBAC role for ${emp.id} (sheet "${emp.sourceSheet}"). ` +
          'Add it to SHEET_TO_ROLE in packages/domain/src/rbac/roles.ts.',
      );
    }

    if (DRY_RUN) {
      created++;
      continue;
    }

    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      updated++;
    } catch {
      const user = await auth.createUser({
        email,
        password: emp.seedPassword,
        displayName: emp.fullName,
        emailVerified: true,
      });
      uid = user.uid;
      created++;
    }

    // These claims are what proxy.ts and the Firestore Security Rules read.
    // `role` is the resolved RBAC role, not the raw "Supervisor"/"Staff" label.
    await auth.setCustomUserClaims(uid, {
      kind: 'employee',
      employeeId: emp.id,
      username: emp.username,
      role,
      department: emp.department,
      isSupervisor: emp.isSupervisor,
    });

    // Profile — deliberately WITHOUT the password.
    await db.collection('employees').doc(emp.id).set(
      {
        uid,
        fullName: emp.fullName,
        department: emp.department,
        position: emp.position,
        username: emp.username,
        role,
        userRole: emp.userRole,
        isSupervisor: emp.isSupervisor,
        status: emp.status,
        mustChangePassword: true,
        seededAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Private username -> email index for login (Development Plan.md §5.2).
    await db.collection('usernames').doc(emp.username.toLowerCase()).set(
      { email, uid, kind: 'employee' },
      { merge: true },
    );
  }

  console.log(`  auth users     ${created} created, ${updated} already existed`);
  console.log(`  profiles       ${employees.length}`);
  console.log(`  username index ${employees.length}`);
}

async function main(): Promise<void> {
  console.log(
    `SFSR-REMS seed -> ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}${DRY_RUN ? '  (DRY RUN)' : ''}`,
  );
  initAdmin();
  const db = getFirestore();

  await seedInventory(db);
  await seedSalesOrg(db);
  await seedEmployees(db);

  // Denormalise the counts the browse pages need, so a page view costs 5
  // reads instead of 155 (Development Plan.md §12.30).
  if (!DRY_RUN) {
    await recomputeStats(db);
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log(DRY_RUN ? 'Dry run complete. Nothing was written.' : 'Seed complete.');
}

void main().catch((error: unknown) => {
  console.error('\nSEED FAILED:', (error as Error).message);
  process.exit(1);
});
