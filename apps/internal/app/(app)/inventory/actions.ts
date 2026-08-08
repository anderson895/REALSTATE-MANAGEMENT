'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import {
  EmployeeId,
  Money,
  ProjectId,
  UnitId,
  can,
  projectCreated,
  unitCreated,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
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
