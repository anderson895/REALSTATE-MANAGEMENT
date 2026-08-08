'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import {
  EmployeeId,
  ROLE_LABELS,
  can,
  employeeCreated,
  employeeStatusChanged,
  employeeUpdated,
  internalEmailFor,
  isInternalRole,
  type InternalRole,
  type Permission,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  activeEmployeeIdsWithRole,
  allocateEmployeeId,
  getAdminAuth,
  getAdminFirestore,
  getEmployee,
  isUsernameTaken,
} from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { generateTemporaryPassword, suggestUsername } from '@/lib/credentials';
import {
  diffEmployee,
  fullNameOf,
  isEmployeeRank,
  isEmployeeStatus,
  validateEmployeeUpdate,
  validateNewEmployee,
  type EmployeeStatus,
  type EmployeeUpdateInput,
  type NewEmployeeInput,
} from '@/lib/employees';

/**
 * Server actions behind User Management.
 *
 * Every action re-checks the permission it needs on USER_MANAGEMENT rather
 * than trusting that the page rendered — a server action is a public endpoint
 * whether or not a button points at it (§3.3). IT_ADMINISTRATOR is the only
 * role in the matrix that holds the module at all, so this one grant is what
 * keeps the other nine out.
 */
async function requireUserAdmin(permission: Permission = 'create') {
  const session = await requireModule('USER_MANAGEMENT');
  if (!can(toActor(session), 'USER_MANAGEMENT', permission)) {
    throw new Error('Your role cannot manage employee accounts.');
  }
  return session;
}

/**
 * The two guards that stand between an edit and an unrecoverable estate.
 *
 * ── Why they exist at all ─────────────────────────────────────────────────
 *
 * USER_MANAGEMENT belongs to IT_ADMINISTRATOR and to nobody else. An estate
 * with no active administrator is one where no account can ever again be
 * created, re-roled or switched back on — including the account that was just
 * switched off. Getting out of that needs the Firebase console and a
 * hand-written custom claim, which is not a recovery path anyone should be one
 * misclick away from needing.
 *
 * So: an administrator may not change their own role, and the last active
 * administrator may not be demoted or deactivated by anyone.
 *
 * ── Why the self-check is separate from the last-one check ────────────────
 *
 * They fail for different reasons and deserve different sentences. With two
 * administrators signed in, the "last one" test passes and self-demotion still
 * locks the person doing it out of the screen they are standing on — mid-edit,
 * with no warning, and no way back to undo it. That is a worse experience than
 * being told no, and the other administrator has to be found to fix it.
 */
async function guardAdministratorFloor(
  target: { id: string; role: string },
  next: { role?: string; status?: EmployeeStatus },
  actingEmployeeId: string,
): Promise<string | null> {
  const losingTheRole = next.role !== undefined && next.role !== target.role;
  const losingAccess = next.status === 'Inactive';
  if (!losingTheRole && !losingAccess) return null;

  if (target.id === actingEmployeeId) {
    return losingAccess
      ? 'You cannot deactivate your own account. Ask another administrator.'
      : 'You cannot change your own role — it would lock you out of this screen mid-edit.';
  }

  if (target.role !== 'IT_ADMINISTRATOR') return null;

  // COST: 1 query over the handful of IT accounts.
  const remaining = (
    await activeEmployeeIdsWithRole(getAdminFirestore(), 'IT_ADMINISTRATOR')
  ).filter((id) => id !== target.id);

  if (remaining.length === 0) {
    return losingAccess
      ? 'This is the last active IT Administrator. Deactivating it would leave nobody able to manage accounts.'
      : 'This is the last active IT Administrator. Changing its role would leave nobody able to manage accounts.';
  }
  return null;
}

/**
 * A free username, suggested from the new employee's name.
 *
 * A server action rather than a helper the form calls directly, for the same
 * two reasons the counter has one: `suggestUsername` sits in a module that
 * imports `node:crypto` and cannot be bundled into a client component, and only
 * the server can say whether the suggestion is actually FREE. Offering a taken
 * name sends the administrator round the loop again.
 */
export async function suggestEmployeeUsername(
  firstName: string,
  lastName: string,
): Promise<string> {
  await requireUserAdmin();

  const base = suggestUsername(firstName, lastName);
  if (!base) return '';

  const db = getAdminFirestore();
  // A handful of tries, then give up and let them type one. Surnames collide —
  // there are already two Santos and two Navarro in RBAC.xls — and an unbounded
  // loop over a growing index does not belong in a form.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    if (!(await isUsernameTaken(db, candidate))) return candidate;
  }
  return '';
}

export interface CreatedEmployee {
  readonly employeeId: string;
  readonly fullName: string;
  readonly username: string;
  readonly email: string;
  readonly roleLabel: string;
  /**
   * Shown ONCE, on screen, for the administrator to hand over.
   *
   * Not stored anywhere and not recoverable: Firebase Auth keeps a hash, and
   * there is no "show me the password again". If it is lost the account is
   * reset through Firebase, which is the correct path — the same arrangement
   * the walk-in counter uses for a buyer's temporary password.
   */
  readonly temporaryPassword: string;
}

export type CreateEmployeeResult =
  | { ok: true; employee: CreatedEmployee }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Open an internal account.
 *
 * ── The four records, and why all four ────────────────────────────────────
 *
 * The seed writes exactly these, and an account missing any one of them is
 * broken in a way that only shows up later:
 *
 *   1. A Firebase Auth user, keyed by a synthesised `@sfsr.internal` address.
 *   2. CUSTOM CLAIMS — `kind`, `employeeId`, `role`, `department`,
 *      `isSupervisor`. This is the authorisation. `proxy.ts` reads it, the
 *      session reads it, and the Firestore Security Rules read it. An account
 *      without claims signs in and can reach nothing.
 *   3. An `employees/{EMPxxx}` profile, WITHOUT the password.
 *   4. A `usernames/{username}` index entry, which is the only way the login
 *      screen turns a typed username into an address (§5.2). Without it the
 *      account exists and cannot be signed into.
 *
 * ── What this records that the seed does not ──────────────────────────────
 *
 * `createdBy` and `createdAt` on the profile, and an `employee.created` entry
 * in `auditLogs`. The seeded twenty-nine carry neither, correctly — nobody
 * decided to add them, the workbook did. Every account opened here is a
 * decision by a named administrator, and both halves of the trail say so: the
 * profile for the screen to show, the audit log because it is append-only and
 * refuses update and delete to every role including this one (§3.6).
 */
export async function createEmployee(input: NewEmployeeInput): Promise<CreateEmployeeResult> {
  const session = await requireUserAdmin();

  const fieldErrors = validateNewEmployee(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // Both are guaranteed by the validation above; narrowing them satisfies the
  // compiler without a cast that would survive the validation being changed.
  if (!isInternalRole(input.role) || !isEmployeeRank(input.rank)) {
    return { ok: false, fieldErrors: { form: 'Choose a role and a rank.' } };
  }
  const role: InternalRole = input.role;
  const isSupervisor = input.rank === 'Supervisor';

  const username = input.username.trim().toLowerCase();
  const email = internalEmailFor(username);
  const fullName = fullNameOf(input.firstName, input.lastName);
  const department = input.department.trim();
  const position = input.position.trim();

  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Checked before anything is created, so the common "taken" case does not
  // leave an orphaned Auth user behind. The `create` calls in the batch below
  // are the actual guarantee; this is here to produce a readable message.
  if (await isUsernameTaken(db, username)) {
    return { ok: false, fieldErrors: { username: 'That username is already taken.' } };
  }

  const employeeId = await allocateEmployeeId(db);
  const temporaryPassword = generateTemporaryPassword();

  let uid: string | undefined;
  try {
    const user = await auth.createUser({
      email,
      password: temporaryPassword,
      displayName: fullName,
      // No mailbox exists behind an @sfsr.internal address, so there is no
      // verification to complete and leaving it false would block sign-in for a
      // reason that can never be resolved. The seed does the same.
      emailVerified: true,
    });
    uid = user.uid;

    await auth.setCustomUserClaims(uid, {
      kind: 'employee',
      employeeId,
      username,
      role,
      department,
      isSupervisor,
    });

    /*
     * `create`, not `set`. The employee id came from the allocator so it cannot
     * already exist, and the username was checked a moment ago — but "a moment
     * ago" is exactly the window a second administrator adding staff at the
     * same time occupies. A failed `create` is the backstop that a pre-check
     * cannot be.
     */
    const batch = db.batch();
    batch.create(db.collection('employees').doc(employeeId), {
      uid,
      fullName,
      department,
      position,
      username,
      role,
      userRole: input.rank,
      isSupervisor,
      status: 'Active',
      mustChangePassword: true,
      // The data trail. Not `seededAt` — this account did not come from a
      // workbook, and the list screen tells the two apart on exactly this field.
      createdBy: session.employeeId,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection('usernames').doc(username), {
      email,
      uid,
      kind: 'employee',
    });
    await batch.commit();

    await new FirestoreAuditLogger(db).record(
      [
        employeeCreated(
          new EmployeeId(employeeId),
          username,
          role,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    revalidatePath('/admin/users');

    return {
      ok: true,
      employee: {
        employeeId,
        fullName,
        username,
        email,
        roleLabel: ROLE_LABELS[role],
        temporaryPassword,
      },
    };
  } catch (error) {
    /*
     * Undo, so the administrator can correct a field and try again rather than
     * being told the username is taken by the half-made account they just
     * failed to create.
     *
     * ── The one thing this must NOT do ───────────────────────────────────
     *
     * Delete `usernames/{username}` unconditionally. The most likely reason the
     * batch failed is that the entry already existed — which means it belongs
     * to SOMEBODY ELSE, and removing it would lock a working account out of the
     * login screen while leaving no trace of why. A batch is atomic, so a
     * failed one wrote nothing; the entry is only ours to remove when it names
     * the uid we just created.
     *
     * The employee id is deliberately not handed back to the allocator. Reading
     * the counter back down races with whoever allocated the next one, and a
     * gap in the EMP series costs nothing.
     */
    if (uid) {
      const claim = await db.collection('usernames').doc(username).get().catch(() => null);
      if (claim?.exists && claim.data()?.uid === uid) {
        await claim.ref.delete().catch(() => undefined);
      }
      await db.collection('employees').doc(employeeId).delete().catch(() => undefined);
      await auth.deleteUser(uid).catch(() => undefined);
    }

    const { code, message } = error as { code?: string | number; message?: string };

    if (code === 'auth/email-already-exists' || code === 'auth/uid-already-exists') {
      return { ok: false, fieldErrors: { username: 'That username is already taken.' } };
    }
    // grpc ALREADY_EXISTS. Only the `usernames` entry can raise it — the
    // employee id came from the allocator — so it means somebody claimed the
    // name between the check above and the commit.
    if (code === 6 || /ALREADY_EXISTS/i.test(message ?? '')) {
      return {
        ok: false,
        fieldErrors: { username: 'That username was taken while you were typing it.' },
      };
    }

    console.error('Employee creation failed:', error);
    return { ok: false, fieldErrors: { form: 'Could not create the account. Please try again.' } };
  }
}

export type UpdateEmployeeResult =
  | { ok: true; changed: boolean; signedOut: boolean }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Change an existing account.
 *
 * ── Why this exists after the screen said it would not ────────────────────
 *
 * The first cut of User Management added accounts and nothing else, reading
 * note.txt literally — "accessible add users only" — and arguing that an
 * administrator who can re-role an account can hand themselves Billing's
 * payment verification. The client has since asked for edit and deactivate
 * outright, so they are here.
 *
 * The segregation argument does not go away, it changes shape: what makes this
 * defensible is that a role change is now the most heavily recorded event in
 * the system. `employee.updated` carries BEFORE and AFTER for every field that
 * moved, in the append-only log that grants no role update or delete —
 * including this one (§3.6). An administrator can still grant themselves
 * nothing quietly; they can only do it loudly.
 *
 * ── The part that is easy to get wrong ────────────────────────────────────
 *
 * The role lives in TWO places: the `employees` document, which this screen
 * reads, and the Firebase Auth CUSTOM CLAIMS, which `proxy.ts`, the session and
 * the Security Rules read. Writing only the document produces a screen that
 * says "Marketing" over an account that still holds Documentation's rights
 * everywhere it counts.
 *
 * Worse, claims are baked into the session cookie at sign-in, so even setting
 * them changes nothing for someone already signed in. `revokeRefreshTokens`
 * is what closes that: `verifySessionCookie(cookie, true)` — the `true` is
 * `checkRevoked` — then rejects the old cookie on its very next request, and
 * the person signs back in holding the new role. A privilege change that waits
 * five days for a cookie to expire is not a privilege change.
 */
export async function updateEmployee(
  employeeId: string,
  input: EmployeeUpdateInput,
): Promise<UpdateEmployeeResult> {
  const session = await requireUserAdmin('modify');

  const fieldErrors = validateEmployeeUpdate(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  if (!isInternalRole(input.role) || !isEmployeeRank(input.rank)) {
    return { ok: false, fieldErrors: { form: 'Choose a role and a rank.' } };
  }
  const role: InternalRole = input.role;
  const isSupervisor = input.rank === 'Supervisor';

  const db = getAdminFirestore();
  const before = await getEmployee(db, employeeId);
  if (!before) {
    return { ok: false, fieldErrors: { form: 'That account no longer exists.' } };
  }
  // Every write below is keyed by uid, not by employee id. A record without one
  // is a broken seed, and saying so beats a generic failure from the Auth SDK.
  if (!before.uid) {
    return {
      ok: false,
      fieldErrors: {
        form: `${before.id} has no Firebase Auth user linked to it. Re-run npm run seed:load.`,
      },
    };
  }

  const refused = await guardAdministratorFloor(before, { role }, session.employeeId);
  if (refused) return { ok: false, fieldErrors: { form: refused } };

  const after = {
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    role,
    userRole: input.rank,
    isSupervisor,
    department: input.department.trim(),
    position: input.position.trim(),
  };

  const changes = diffEmployee(
    {
      fullName: before.fullName,
      role: before.role,
      userRole: before.userRole,
      isSupervisor: before.isSupervisor,
      department: before.department,
      position: before.position,
    },
    after,
  );

  // Opening a form, looking at it and closing it is not an event. Writing a
  // document and an audit entry saying nothing changed makes the log harder to
  // read for no gain.
  if (Object.keys(changes).length === 0) {
    return { ok: true, changed: false, signedOut: false };
  }

  // Only the three claims-bearing fields need the session killed. Fixing a typo
  // in a job title should not sign somebody out mid-reservation.
  const claimsMoved =
    changes.role !== undefined ||
    changes.isSupervisor !== undefined ||
    changes.department !== undefined;

  try {
    const auth = getAdminAuth();

    if (claimsMoved) {
      await auth.setCustomUserClaims(before.uid, {
        kind: 'employee',
        employeeId: before.id,
        username: before.username,
        role: after.role,
        department: after.department,
        isSupervisor: after.isSupervisor,
      });
      await auth.revokeRefreshTokens(before.uid);
    }

    if (changes.fullName !== undefined) {
      // The session reads the display name off the token's `name` claim, so
      // leaving this behind would keep the old name in the topbar for as long
      // as the cookie lives.
      await auth.updateUser(before.uid, { displayName: after.fullName });
    }

    await db.collection('employees').doc(before.id).update({
      ...after,
      updatedBy: session.employeeId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await new FirestoreAuditLogger(db).record(
      [
        employeeUpdated(
          new EmployeeId(before.id),
          changes,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    revalidatePath('/admin/users');
    return { ok: true, changed: true, signedOut: claimsMoved };
  } catch (error) {
    console.error('Employee update failed:', error);
    return { ok: false, fieldErrors: { form: 'Could not save the changes. Please try again.' } };
  }
}

export type StatusResult = { ok: true } | { ok: false; error: string };

/**
 * Deactivate an account, or bring it back.
 *
 * ── Deactivated, not deleted, and deliberately ────────────────────────────
 *
 * The `usernames` entry stays, so the name cannot be handed to somebody else.
 * Every reservation this person verified and every approval they signed records
 * their employee id, and the trail is worth nothing if `EMP012` can come to
 * mean a different human next year. The employee document stays for the same
 * reason — `resolveEmployeeNames` still resolves it, so a two-year-old
 * reservation keeps showing a name rather than a bare id.
 *
 * ── What actually stops them signing in ───────────────────────────────────
 *
 * Three things, and the Firestore field is the least of them:
 *
 *   1. `disabled: true` on the Auth user — Firebase refuses the sign-in itself.
 *   2. `revokeRefreshTokens` — kills the session ALREADY OPEN. Without it, an
 *      employee walked out this morning keeps working until their cookie
 *      expires, which is up to five days. `verifySessionCookie` passes
 *      `checkRevoked: true` precisely so this lands on the next request.
 *   3. `status: 'Inactive'` on the document, which is what this screen shows.
 *
 * Reactivating undoes the first and third. It deliberately does NOT un-revoke
 * anything — there is no such operation, and there should not be: the person
 * signs in again and gets a fresh session carrying whatever role they hold now.
 */
export async function setEmployeeStatus(
  employeeId: string,
  status: string,
): Promise<StatusResult> {
  const session = await requireUserAdmin('modify');

  if (!isEmployeeStatus(status)) return { ok: false, error: 'Unknown account status.' };

  const db = getAdminFirestore();
  const employee = await getEmployee(db, employeeId);
  if (!employee) return { ok: false, error: 'That account no longer exists.' };
  if (!employee.uid) {
    return {
      ok: false,
      error: `${employee.id} has no Firebase Auth user linked to it. Re-run npm run seed:load.`,
    };
  }

  if (employee.status === status) return { ok: true };

  const refused = await guardAdministratorFloor(employee, { status }, session.employeeId);
  if (refused) return { ok: false, error: refused };

  const deactivating = status === 'Inactive';

  try {
    const auth = getAdminAuth();
    await auth.updateUser(employee.uid, { disabled: deactivating });
    if (deactivating) await auth.revokeRefreshTokens(employee.uid);

    await db.collection('employees').doc(employee.id).update({
      status,
      statusChangedBy: session.employeeId,
      statusChangedAt: FieldValue.serverTimestamp(),
    });

    await new FirestoreAuditLogger(db).record(
      [
        employeeStatusChanged(
          new EmployeeId(employee.id),
          status,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    revalidatePath('/admin/users');
    return { ok: true };
  } catch (error) {
    console.error('Employee status change failed:', error);
    return { ok: false, error: 'Could not change the account status. Please try again.' };
  }
}
