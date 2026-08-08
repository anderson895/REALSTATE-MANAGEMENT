import { FieldPath, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';

/**
 * Read side of User Management, plus the one allocator it needs.
 *
 * note.txt leaves IT with two things, and this is the second: "accessible add
 * users only". The screen at /admin/users lists the roster and opens accounts;
 * it deliberately offers nothing else, because an administrator who can also
 * disable, re-role or delete an account can quietly reshape who may approve a
 * reservation (§3.4, Least Privilege).
 */

/**
 * The roster is 29 people and grows by a handful a year. A cap is here because
 * an unbounded `.get()` on a collection is a habit worth not forming, not
 * because this one is close to it.
 */
export const MAX_EMPLOYEES_PER_QUERY = 200;

export interface EmployeeRow {
  readonly id: string;
  /**
   * Firebase Auth uid.
   *
   * Needed by every write: the claims, the disabled flag and the token
   * revocation are all keyed by uid, not by employee id. Never rendered — it
   * is a key, not a fact about the person.
   */
  readonly uid: string;
  readonly fullName: string;
  readonly username: string;
  readonly department: string;
  readonly position: string;
  /** The resolved RBAC role — `IT_ADMINISTRATOR`, `MARKETING`, … */
  readonly role: string;
  /** The RANK label from RBAC.xls — "Staff", "Supervisor", "Agent". */
  readonly userRole: string;
  readonly isSupervisor: boolean;
  readonly status: string;
  readonly mustChangePassword: boolean;
  /**
   * Null for every seeded account, and that is the honest value.
   *
   * The 29 accounts in RBAC.xls were not added by anybody — the workbook put
   * them there. Filling this with the administrator who happened to run the
   * seed would attribute a decision nobody made. The screen prints "seeded from
   * RBAC.xls" for these rather than a name.
   */
  readonly createdBy: string | null;
  readonly createdAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function toRow(id: string, raw: DocumentData): EmployeeRow {
  return {
    id,
    uid: String(raw.uid ?? ''),
    fullName: String(raw.fullName ?? id),
    username: String(raw.username ?? ''),
    department: String(raw.department ?? ''),
    position: String(raw.position ?? ''),
    role: String(raw.role ?? ''),
    userRole: String(raw.userRole ?? ''),
    isSupervisor: raw.isSupervisor === true,
    status: String(raw.status ?? 'Active'),
    mustChangePassword: raw.mustChangePassword === true,
    createdBy: raw.createdBy == null || raw.createdBy === '' ? null : String(raw.createdBy),
    createdAt: toIso(raw.createdAt) ?? toIso(raw.seededAt),
  };
}

/**
 * Every internal account, newest first.
 *
 * Ordered by document id descending rather than by a date, because the seeded
 * rows have no `createdAt` of their own — ordering on a field two thirds of the
 * collection does not carry would drop them from the list entirely. `EMP030`
 * sorts after `EMP029` for the same reason the ids are zero-padded to three
 * digits, so newest-first and highest-id-first are the same ordering here.
 */
export async function listEmployees(
  db: Firestore,
  limit = MAX_EMPLOYEES_PER_QUERY,
): Promise<EmployeeRow[]> {
  const snap = await db
    .collection('employees')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(Math.min(limit, MAX_EMPLOYEES_PER_QUERY))
    .get();

  return snap.docs.map((doc) => toRow(doc.id, doc.data()));
}

export async function getEmployee(db: Firestore, id: string): Promise<EmployeeRow | null> {
  const snap = await db.collection('employees').doc(id.trim().toUpperCase()).get();
  const data = snap.data();
  return snap.exists && data ? toRow(snap.id, data) : null;
}

/**
 * The ids of every ACTIVE account holding a role.
 *
 * ── What this is actually for ─────────────────────────────────────────────
 *
 * One question: "if I deactivate this administrator, is anybody left who can
 * add users?" USER_MANAGEMENT belongs to IT_ADMINISTRATOR alone, so an estate
 * with no active administrator is an estate where no account can ever be
 * created, re-roled or reactivated again — including the one just switched off.
 * Recovering from that needs the Firebase console and a hand-written claim.
 *
 * ── Why one equality filter and not two ───────────────────────────────────
 *
 * `.where('role', ...).where('status', ...)` is two equality clauses, which
 * Firestore serves by merging single-field indexes — usually. Rather than
 * depend on that, this filters on `role` (at most a handful of documents) and
 * checks `status` in memory. No composite index to add to
 * firestore.indexes.json, and no way for this guard to start failing because an
 * index was never deployed.
 */
export async function activeEmployeeIdsWithRole(
  db: Firestore,
  role: string,
): Promise<string[]> {
  const snap = await db.collection('employees').where('role', '==', role).get();
  return snap.docs.filter((doc) => (doc.data().status ?? 'Active') === 'Active').map((d) => d.id);
}

/**
 * Is this username spoken for?
 *
 * Checks the `usernames` index, not the `employees` collection — buyers live in
 * the same index, and an employee taking a username a buyer already has would
 * make `resolveUsername` ambiguous at the login screen for both of them.
 */
export async function isUsernameTaken(db: Firestore, username: string): Promise<boolean> {
  const key = username.trim().toLowerCase();
  if (key.length === 0) return false;
  return (await db.collection('usernames').doc(key).get()).exists;
}

/** `EMP030`. Three digits, zero-padded, matching every id RBAC.xls issued. */
export function formatEmployeeId(sequence: number): string {
  return `EMP${String(sequence).padStart(3, '0')}`;
}

const EMPLOYEE_ID_PATTERN = /^EMP(\d+)$/;

function sequenceOf(id: string): number {
  const match = EMPLOYEE_ID_PATTERN.exec(id.trim().toUpperCase());
  return match ? Number(match[1]) : 0;
}

/**
 * The next free employee id.
 *
 * ── Why a counter, and why it can initialise itself ───────────────────────
 *
 * The seed writes `EMP001`–`EMP029` straight from RBAC.xls without an
 * allocator, so on a freshly seeded database there is no counter to read and a
 * naive one would start at `EMP001` and collide with Juan Dela Cruz. Rather
 * than requiring a re-seed to plant the counter — which would make this feature
 * silently depend on an operational step nobody would remember — the first
 * allocation reads the highest existing id and starts from there.
 *
 * That scan happens exactly ONCE in the life of the database. Every allocation
 * after it reads a single counter document, inside a transaction, so two
 * administrators adding staff at the same moment serialise here instead of both
 * being handed `EMP030` (the same argument as `nextNumber` for reservations,
 * §8.6).
 *
 * Gaps are acceptable here in a way they are not for reservation numbers: this
 * allocates before Firebase Auth is asked for a user, and an account creation
 * that fails afterwards leaves the number burnt. An employee id is a key, not a
 * sequence anyone audits for completeness.
 */
export async function allocateEmployeeId(db: Firestore): Promise<string> {
  const counterRef = db.collection('counters').doc('employees');

  return db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);

    let last = counter.exists ? Number(counter.data()?.value ?? 0) : 0;
    if (!counter.exists) {
      const highest = await tx.get(
        db.collection('employees').orderBy(FieldPath.documentId(), 'desc').limit(1),
      );
      last = highest.empty ? 0 : sequenceOf(highest.docs[0]!.id);
    }

    const next = last + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return formatEmployeeId(next);
  });
}
