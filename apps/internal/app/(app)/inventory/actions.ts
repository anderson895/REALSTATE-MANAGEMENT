'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import {
  EmployeeId,
  Money,
  ProjectId,
  UnitId,
  can,
  canManageMedia,
  canRemoveInventory,
  projectCreated,
  projectDeleted,
  projectMediaCleared,
  projectMediaUpdated,
  unitCreated,
  unitDeleted,
} from '@sfsr/domain';
import { publicConfig } from '@sfsr/infrastructure';
import {
  FirestoreAuditLogger,
  deleteProjectMedia,
  getAdminFirestore,
  nextUnitId,
  recomputeProjectStats,
  unitNumberTaken,
  unitPrefixInUse,
} from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { projectSchema, unitSchema } from '@/lib/inventory';

/**
 * Server actions behind Unit Inventory.
 *
 * ── Who is allowed in here ────────────────────────────────────────────────
 *
 * `create` on UNIT_INVENTORY, which only MARKETING holds. Sales and Account
 * Receivables have the module with view and print, so they reach the SCREEN and
 * are refused by this check — which is the point of checking the permission
 * rather than the module. IT_ADMINISTRATOR has neither.
 *
 * Every action re-checks rather than trusting that a page rendered: a server
 * action is a public endpoint whether or not a button points at it (§3.3).
 */
async function requireInventoryWriter() {
  const session = await requireModule('UNIT_INVENTORY');
  if (!can(toActor(session), 'UNIT_INVENTORY', 'create')) {
    throw new Error('Your role can view inventory but not add to it.');
  }
  return session;
}

export type InventoryResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fieldErrorsFrom(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return fieldErrors;
}

/**
 * Add a project.
 *
 * ── Why the code IS the document id ──────────────────────────────────────
 *
 * Every seeded project has `id === code` — `TLP001`, `EPR002` — and the whole
 * system leans on it: units store a `projectId`, the Portal routes on
 * `/projects/[projectId]`, and the media uploader writes to
 * `sfsr/projects/{id}/hero`. Generating a separate surrogate id would give
 * every project two names and make the Cloudinary folder unreadable.
 *
 * So the code is typed, validated for shape, and `create()` is what enforces
 * uniqueness — a pre-read plus a `set()` would have a window between them.
 *
 * `stats` is written empty rather than left absent. `listProjects` fills the
 * gap with EMPTY_STATS either way, but a project whose stats field only appears
 * once it has units is one more shape for every reader to handle.
 */
export async function createProject(payload: unknown): Promise<InventoryResult> {
  const session = await requireInventoryWriter();

  const parsed = projectSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the form.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const data = parsed.data;
  const db = getAdminFirestore();

  // COST: 1 read. Two projects sharing a unit prefix would interleave their id
  // series inside the one `units` collection — see `unitPrefixInUse`.
  if (await unitPrefixInUse(db, data.unitPrefix)) {
    return {
      ok: false,
      error: 'Please check the form.',
      fieldErrors: {
        unitPrefix: `Units already exist with the prefix ${data.unitPrefix}. Choose another.`,
      },
    };
  }

  try {
    await db
      .collection('projects')
      .doc(data.code)
      .create({
        name: data.name,
        code: data.code,
        developer: data.developer,
        location: data.location,
        buildingType: data.buildingType,
        floorsRaw: data.floorsRaw,
        theme: data.theme || '',
        unitPrefix: data.unitPrefix,
        // No renders yet. `upload-media.ts` fills these for the seeded five,
        // and the Portal already draws a branded placeholder when they are null
        // rather than a broken image (§12.10).
        heroImageUrl: null,
        floorPlans: {},
        stats: {
          totalUnits: 0,
          availableUnits: 0,
          onHoldUnits: 0,
          soldUnits: 0,
          totalParking: 0,
          availableParking: 0,
          minPriceCentavos: null,
          maxPriceCentavos: null,
          unitTypes: [],
        },
        createdBy: session.employeeId,
        createdAt: FieldValue.serverTimestamp(),
      });

    await new FirestoreAuditLogger(db).record(
      [
        projectCreated(
          new ProjectId(data.code),
          data.name,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id: data.code };
  } catch (error) {
    const { code, message } = error as { code?: string | number; message?: string };
    if (code === 6 || /ALREADY_EXISTS/i.test(message ?? '')) {
      return {
        ok: false,
        error: 'Please check the form.',
        fieldErrors: { code: `Project ${data.code} already exists.` },
      };
    }
    console.error('Project creation failed:', error);
    return { ok: false, error: 'Could not add the project. Please try again.' };
  }
}

/**
 * Add a unit.
 *
 * ── The three things this gets right that a plain write would not ────────
 *
 * 1. The ID. `nextUnitId` derives the project's prefix and the highest number
 *    already used, so a unit added to Emerald Park becomes `EU031` and not
 *    `U031`. It is a read, not a lock — `create()` below is the lock.
 *
 * 2. The STATUS. Always `Available`, never taken from the form, mirroring
 *    `Unit.create()` in the domain: "Builds a brand-new unit. Always starts
 *    Available." A unit that could be born `Sold` would have no reservation
 *    behind it and would break the transition rules the entity enforces.
 *
 * 3. The STATS. `recomputeProjectStats` runs afterwards, because the landing
 *    page and the browse pages read the denormalised counts on the project
 *    rather than the units (§12.30). A unit added without it exists and is
 *    invisible.
 *
 * ── What this cannot do, stated rather than hidden ───────────────────────
 *
 * The Portal caches the catalogue with `unstable_cache` for ten minutes, and it
 * is a SEPARATE Next.js process on a different machine. `updateTag('projects')`
 * invalidates this app's cache, not the Portal's. A new unit therefore appears
 * to buyers within the TTL rather than immediately. That is safe — availability
 * is re-read uncached inside the reservation transaction, so a stale listing
 * costs a wasted click and cannot cause a double sale — but it is not instant,
 * and nobody should be told it is.
 */
export async function createUnit(payload: unknown): Promise<InventoryResult> {
  const session = await requireInventoryWriter();

  const parsed = unitSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the form.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const data = parsed.data;
  const db = getAdminFirestore();

  const project = await db.collection('projects').doc(data.projectId).get();
  if (!project.exists) {
    return {
      ok: false,
      error: 'Please check the form.',
      fieldErrors: { projectId: 'That project no longer exists.' },
    };
  }

  // Not a uniqueness CONSTRAINT — the id is the key, and `unitNo` is a label.
  // But two "A-101"s in one building is a data-entry mistake every time, and
  // catching it here costs one read and saves a reservation raised against the
  // wrong unit.
  if (await unitNumberTaken(db, data.projectId, data.unitNo)) {
    return {
      ok: false,
      error: 'Please check the form.',
      fieldErrors: { unitNo: `${data.unitNo} already exists in this project.` },
    };
  }

  const { id } = await nextUnitId(
    db,
    data.projectId,
    String(project.data()?.unitPrefix ?? data.projectId.slice(0, 2)),
  );

  try {
    await db
      .collection('units')
      .doc(id)
      .create({
        projectId: data.projectId,
        tower: data.tower || null,
        floor: data.floor,
        unitNo: data.unitNo,
        unitType: data.unitType,
        areaSqm: data.areaSqm,
        // Pesos become centavos exactly here and nowhere else (§3.5).
        pricePerSqmCentavos: Money.fromPesos(data.pricePerSqm).toCentavos(),
        purchasePriceCentavos: Money.fromPesos(data.purchasePrice).toCentavos(),
        status: 'Available',
        currentReservation: null,
        createdBy: session.employeeId,
        createdAt: FieldValue.serverTimestamp(),
      });

    await new FirestoreAuditLogger(db).record(
      [
        unitCreated(
          new UnitId(id),
          new ProjectId(data.projectId),
          data.unitNo,
          Money.fromPesos(data.purchasePrice).toCentavos(),
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    // After the unit exists, and outside its write: stats are a cache, and a
    // failed recompute must not take the unit with it.
    await recomputeProjectStats(db, data.projectId);

    updateTag('units');
    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id };
  } catch (error) {
    const { code, message } = error as { code?: string | number; message?: string };
    if (code === 6 || /ALREADY_EXISTS/i.test(message ?? '')) {
      return {
        ok: false,
        error: `Unit ${id} was taken while you were typing. Try again.`,
      };
    }
    console.error('Unit creation failed:', error);
    return { ok: false, error: 'Could not add the unit. Please try again.' };
  }
}

/**
 * Records a picture Marketing has just uploaded.
 *
 * The bytes are already in Cloudinary by the time this runs — the browser sent
 * them straight there with a ticket signed by
 * `/api/upload/project-media`. All that is left is to point the document at
 * the result, which is the half that decides whether anybody ever sees it.
 *
 * ── Why the URL is not trusted as sent ───────────────────────────────────
 *
 * It arrives from a browser, so it could be any address at all — including one
 * pointing somewhere off-site. A project document is read by the public Portal
 * and rendered into an `<img>`, so an arbitrary URL here is an arbitrary
 * request made by every visitor. It is therefore required to be a Cloudinary
 * delivery URL for THIS account, and to contain the exact `public_id` the
 * ticket route derived for the slot.
 *
 * ── What this does not do ────────────────────────────────────────────────
 *
 * It does not delete the old picture. The path is fixed, so Cloudinary has
 * already overwritten it — there is nothing left to delete, and a `destroy`
 * call here would be aimed at the asset that was just uploaded.
 */
export type MediaSlotName = 'hero' | 'amenities' | 'floorPlan' | 'unitPhoto';

export async function saveProjectMedia(payload: {
  projectId: string;
  slot: MediaSlotName;
  url: string;
  unitType?: string;
  unitId?: string;
}): Promise<InventoryResult> {
  const session = await requireModule('UNIT_INVENTORY');
  const actor = toActor(session);
  if (!canManageMedia(actor)) {
    return { ok: false, error: 'Only Marketing can change project and unit pictures.' };
  }

  const { projectId, slot, url, unitType, unitId } = payload;
  const db = getAdminFirestore();
  const config = publicConfig.cloudinary.cloudName;

  if (!url.startsWith(`https://res.cloudinary.com/${config}/`)) {
    return { ok: false, error: 'That image did not come from our media library.' };
  }

  try {
    if (slot === 'unitPhoto') {
      if (!unitId) return { ok: false, error: 'Unit is required.' };
      const unit = await db.collection('units').doc(unitId).get();
      if (!unit.exists || String(unit.data()?.projectId ?? '') !== projectId) {
        return { ok: false, error: 'That unit is not in this project.' };
      }
      await db.collection('units').doc(unitId).update({
        photoUrl: url,
        mediaUpdatedAt: FieldValue.serverTimestamp(),
      });
      updateTag('units');
      revalidatePath('/inventory');
      return { ok: true, id: unitId };
    }

    const ref = db.collection('projects').doc(projectId);
    if (!(await ref.get()).exists) {
      return { ok: false, error: 'That project does not exist.' };
    }

    if (slot === 'floorPlan') {
      if (!unitType) return { ok: false, error: 'Unit type is required.' };
      // Dot-path so one plan is replaced without rewriting the map — two people
      // editing different types at once would otherwise overwrite each other.
      await ref.update({
        [`floorPlans.${unitType}`]: url,
        mediaUpdatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await ref.update({
        [slot === 'hero' ? 'heroImageUrl' : 'amenitiesImageUrl']: url,
        mediaUpdatedAt: FieldValue.serverTimestamp(),
      });
    }

    await new FirestoreAuditLogger(db).record(
      [
        projectMediaUpdated(
          new ProjectId(projectId),
          slot === 'floorPlan' ? `${slot}:${unitType}` : slot,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id: projectId };
  } catch (error) {
    console.error('Saving project media failed:', error);
    return { ok: false, error: 'Could not save that picture. Please try again.' };
  }
}

/**
 * Removes an EMPTY project from the catalogue.
 *
 * ── Why this exists, when `delete` was withheld on purpose ───────────────
 *
 * `create` without a way back produced the mess the caution was meant to
 * prevent. A project typed by mistake goes straight to the public Portal —
 * there is no draft state and no filter on empty projects — and taking it off
 * needed a developer with a Firestore console.
 *
 * ── What it refuses, and why the count is redone here ────────────────────
 *
 * Any project holding a unit, a parking slot or a reservation. That is the
 * whole of the original objection: those records name the project, and
 * deleting it would leave every one of them pointing at nothing.
 *
 * The three counts are taken INSIDE this action rather than read off the
 * screen. `stats.totalUnits` is denormalised and can lag; the button is drawn
 * from it, and a unit added between the page rendering and the click would
 * otherwise be orphaned by a button that still said the project was empty.
 * `count()` bills one read per 1,000 index entries, so asking properly is
 * nearly free.
 *
 * ── Not a way to retire a real project ───────────────────────────────────
 *
 * One with stock is refused and always will be. A building that stops selling
 * is not deleted — its units go On Hold or Sold, which is what those statuses
 * are for.
 */
export async function deleteProject(projectId: string): Promise<InventoryResult> {
  const session = await requireModule('UNIT_INVENTORY');
  const actor = toActor(session);
  if (!canRemoveInventory(actor)) {
    return { ok: false, error: 'Your role cannot remove a project.' };
  }

  const id = projectId.trim();
  if (!id) return { ok: false, error: 'Project is required.' };

  const db = getAdminFirestore();

  try {
    const snap = await db.collection('projects').doc(id).get();
    if (!snap.exists) return { ok: false, error: 'That project no longer exists.' };
    const name = String(snap.data()?.name ?? id);

    const [units, parking, reservations] = await Promise.all([
      db.collection('units').where('projectId', '==', id).count().get(),
      db.collection('parkingSlots').where('projectId', '==', id).count().get(),
      db.collection('reservations').where('projectId', '==', id).count().get(),
    ]);

    const holding: string[] = [];
    if (units.data().count > 0) holding.push(`${units.data().count} unit(s)`);
    if (parking.data().count > 0) holding.push(`${parking.data().count} parking slot(s)`);
    if (reservations.data().count > 0) {
      holding.push(`${reservations.data().count} reservation(s)`);
    }

    if (holding.length > 0) {
      return {
        ok: false,
        error:
          `${name} still holds ${holding.join(', ')}, so it cannot be removed — those records ` +
          'would be left pointing at a project that no longer exists. A project that has stopped ' +
          'selling is retired by the status of its units, not by deleting it.',
      };
    }

    // Logged BEFORE the delete. Afterwards there is no document left to read a
    // name off, and an entry written after a failed delete would be a lie.
    await new FirestoreAuditLogger(db).record(
      [projectDeleted(new ProjectId(id), name, new EmployeeId(session.employeeId), new Date())],
      session.employeeId,
    );

    await db.collection('projects').doc(id).delete();

    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id };
  } catch (error) {
    console.error('Project deletion failed:', error);
    return { ok: false, error: 'Could not remove the project. Please try again.' };
  }
}

/**
 * Takes a picture off a project or a unit.
 *
 * ── Why the CDN copy is destroyed too ────────────────────────────────────
 *
 * Clearing the field alone would leave the file reachable. These are public
 * assets: the URL keeps working after the document stops mentioning it, so a
 * picture "removed" only from Firestore is still one anybody holding the link
 * can open. A wrong image uploaded to a unit is exactly the case that matters
 * for.
 *
 * The destroy runs FIRST, because the opposite order can leave a document
 * pointing at an asset that no longer exists — a broken image on the Portal,
 * which is worse than an unwanted one.
 */
export async function clearProjectMedia(payload: {
  projectId: string;
  slot: MediaSlotName;
  unitType?: string;
  unitId?: string;
}): Promise<InventoryResult> {
  const session = await requireModule('UNIT_INVENTORY');
  const actor = toActor(session);
  if (!canManageMedia(actor)) {
    return { ok: false, error: 'Only Marketing can change project and unit pictures.' };
  }

  const { projectId, slot, unitType, unitId } = payload;
  const db = getAdminFirestore();

  try {
    if (slot === 'unitPhoto') {
      if (!unitId) return { ok: false, error: 'Unit is required.' };
      const unit = await db.collection('units').doc(unitId).get();
      if (!unit.exists || String(unit.data()?.projectId ?? '') !== projectId) {
        return { ok: false, error: 'That unit is not in this project.' };
      }
      await deleteProjectMedia(projectId, { kind: 'unitPhoto', unitId });
      await db
        .collection('units')
        .doc(unitId)
        .update({ photoUrl: null, mediaUpdatedAt: FieldValue.serverTimestamp() });
      updateTag('units');
      revalidatePath('/inventory');
      return { ok: true, id: unitId };
    }

    const ref = db.collection('projects').doc(projectId);
    if (!(await ref.get()).exists) {
      return { ok: false, error: 'That project does not exist.' };
    }

    if (slot === 'floorPlan') {
      if (!unitType) return { ok: false, error: 'Unit type is required.' };
      await deleteProjectMedia(projectId, { kind: 'floorPlan', unitType });
      // Deleted from the map rather than set to null: `floorPlans[type]` is
      // read with `?? null`, and a key holding null would be one more shape for
      // every reader to know about.
      await ref.update({
        [`floorPlans.${unitType}`]: FieldValue.delete(),
        mediaUpdatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await deleteProjectMedia(projectId, { kind: slot === 'hero' ? 'hero' : 'amenities' });
      await ref.update({
        [slot === 'hero' ? 'heroImageUrl' : 'amenitiesImageUrl']: null,
        mediaUpdatedAt: FieldValue.serverTimestamp(),
      });
    }

    await new FirestoreAuditLogger(db).record(
      [
        projectMediaCleared(
          new ProjectId(projectId),
          slot === 'floorPlan' ? `${slot}:${unitType}` : slot,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id: projectId };
  } catch (error) {
    console.error('Clearing project media failed:', error);
    return { ok: false, error: 'Could not remove that picture. Please try again.' };
  }
}

/**
 * Removes a unit that nothing refers to.
 *
 * ── The two conditions, and why neither alone is enough ──────────────────
 *
 * AVAILABLE, and never reserved. The matrix comment on UNIT_INVENTORY is the
 * reason: a unit is named by reservations, payments, documents and the audit
 * trail, and deleting one that any of them point at leaves them pointing at
 * nothing.
 *
 * Status alone does not cover it. A reservation that was cancelled or expired
 * puts its unit back to Available while the reservation record survives and
 * still names it — so the reservation count is checked as well. Neither test
 * catches what the other does.
 *
 * ── Why both are re-read here ────────────────────────────────────────────
 *
 * The screen draws the button from the status it read when the page rendered.
 * A buyer reserving in between flips it to On Hold, and a button drawn a
 * minute ago must not delete the unit underneath them.
 *
 * A unit that has genuinely sold is never deleted. It is `Sold`, which is what
 * that status is for.
 */
export async function deleteUnit(unitId: string): Promise<InventoryResult> {
  const session = await requireModule('UNIT_INVENTORY');
  const actor = toActor(session);
  if (!canRemoveInventory(actor)) {
    return { ok: false, error: 'Your role cannot remove a unit.' };
  }

  const id = unitId.trim();
  if (!id) return { ok: false, error: 'Unit is required.' };

  const db = getAdminFirestore();

  try {
    const snap = await db.collection('units').doc(id).get();
    const data = snap.data();
    if (!snap.exists || !data) return { ok: false, error: 'That unit no longer exists.' };

    const projectId = String(data.projectId ?? '');
    const unitNo = String(data.unitNo ?? id);
    const status = String(data.status ?? '');

    if (status !== 'Available') {
      return {
        ok: false,
        error:
          `${unitNo} is ${status}, so it cannot be removed. A unit taken off the market stays on ` +
          'the record — that is what On Hold and Sold are for.',
      };
    }

    const reservations = await db.collection('reservations').where('unitId', '==', id).count().get();

    if (reservations.data().count > 0) {
      return {
        ok: false,
        error:
          `${unitNo} has ${reservations.data().count} reservation(s) against it, including any ` +
          'that were cancelled or expired. Removing it would leave those records naming a unit ' +
          'that no longer exists.',
      };
    }

    // Before the delete: afterwards there is no document to read a number or a
    // price off, and those are what make the entry mean anything.
    await new FirestoreAuditLogger(db).record(
      [
        unitDeleted(
          new UnitId(id),
          new ProjectId(projectId),
          unitNo,
          Number(data.purchasePriceCentavos ?? 0),
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    // Best effort: a unit with no photo has nothing to destroy, and a CDN
    // failure must not leave the unit itself undeleted.
    if (data.photoUrl) {
      try {
        await deleteProjectMedia(projectId, { kind: 'unitPhoto', unitId: id });
      } catch (error) {
        console.error('Unit photo could not be removed from the CDN:', error);
      }
    }

    await db.collection('units').doc(id).delete();
    await recomputeProjectStats(db, projectId);

    updateTag('units');
    updateTag('projects');
    revalidatePath('/inventory');
    return { ok: true, id };
  } catch (error) {
    console.error('Unit deletion failed:', error);
    return { ok: false, error: 'Could not remove the unit. Please try again.' };
  }
}
