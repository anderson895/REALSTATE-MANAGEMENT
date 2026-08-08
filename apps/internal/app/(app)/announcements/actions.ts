'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import {
  EmployeeId,
  announcementArchived,
  announcementPublished,
  can,
} from '@sfsr/domain';
import {
  FirestoreAuditLogger,
  getAdminFirestore,
  getProject,
} from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { announcementSchema } from '@/lib/announcements';

/**
 * Server actions behind the Advertisement module.
 *
 * MARKETING is the only role in the RBAC matrix that holds ADVERTISEMENT, so
 * the module grant alone is what keeps the other nine roles out — including
 * IT_ADMINISTRATOR, which creates the Marketing account and then cannot post
 * with it. That is the same segregation note.txt applies everywhere else: the
 * role that opens the account is not the role that uses it.
 *
 * The permission is re-checked in every action rather than trusted from the
 * page, because a server action is a public endpoint whether or not a button
 * points at it (§3.3).
 */
async function requireMarketing(permission: 'create' | 'delete') {
  const session = await requireModule('ADVERTISEMENT');
  if (!can(toActor(session), 'ADVERTISEMENT', permission)) {
    throw new Error('Your role cannot manage announcements.');
  }
  return session;
}

export type PublishResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Post an announcement.
 *
 * ── The data trail, in two places on purpose ─────────────────────────────
 *
 * `createdBy` on the document is what the screen reads — a name beside every
 * post, resolved through `resolveEmployeeNames`. It answers "who put this up"
 * for the person looking at it.
 *
 * The `auditLogs` entry answers the same question for somebody looking later,
 * and it is the one that holds: the announcement document can be archived or
 * overwritten, while `auditLogs` grants no role update or delete — not even the
 * administrator (§3.6). One is a convenience, the other is the record.
 *
 * The project NAME is denormalised at write time rather than joined at read
 * time. It costs one read here and saves one per announcement on every page
 * view afterwards, which is the same trade `listDocumentQueue` makes and the
 * reason the browse pages cost 5 reads instead of 155 (§12.30).
 */
export async function publishAnnouncement(payload: unknown): Promise<PublishResult> {
  const session = await requireMarketing('create');

  const parsed = announcementSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      // `images.0.url` -> `images`, so the message lands on the control the
      // person can actually see rather than on a path with no field behind it.
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, error: 'Please check the form.', fieldErrors };
  }
  const data = parsed.data;

  const db = getAdminFirestore();

  // A project that no longer exists must not be silently attached. COST: 1 read
  // when a project was chosen, 0 otherwise.
  let projectId: string | null = null;
  let projectName: string | null = null;
  if (data.projectId) {
    const project = await getProject(db, data.projectId);
    if (!project) {
      return {
        ok: false,
        error: 'Please check the form.',
        fieldErrors: { projectId: 'That project no longer exists.' },
      };
    }
    projectId = project.id;
    projectName = project.name;
  }

  try {
    const ref = db.collection('announcements').doc();
    await ref.set({
      title: data.title,
      body: data.body,
      projectId,
      projectName,
      images: data.images,
      status: 'Published',
      // WHO posted it. Not a display name — the employee id, so the trail
      // survives the person being renamed and resolves the same way every
      // other actor in this system does.
      createdBy: session.employeeId,
      createdAt: FieldValue.serverTimestamp(),
      archivedBy: null,
      archivedAt: null,
    });

    await new FirestoreAuditLogger(db).record(
      [
        announcementPublished(
          ref.id,
          data.title,
          new EmployeeId(session.employeeId),
          new Date(),
        ),
      ],
      session.employeeId,
    );

    revalidatePath('/announcements');
    return { ok: true, id: ref.id };
  } catch (error) {
    console.error('Publishing an announcement failed:', error);
    return { ok: false, error: 'Could not publish the announcement. Please try again.' };
  }
}

export type ArchiveResult = { ok: true } | { ok: false; error: string };

/**
 * Take an announcement down.
 *
 * Archived, not deleted, and the row stays on the screen drawn muted. The
 * module's other job is the trail, and a trail that removes the row when the
 * post comes down cannot answer "what was up here last week" — which is the
 * question somebody asks precisely BECAUSE it came down.
 *
 * The Cloudinary asset is left in place for the same reason. `deleteAsset`
 * exists and is deliberately not called: destroying the image would make the
 * archived record unreadable, and these sit on the public CDN where they cost
 * storage and nothing else.
 */
export async function archiveAnnouncement(id: string): Promise<ArchiveResult> {
  const session = await requireMarketing('delete');

  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: 'No announcement was named.' };

  const db = getAdminFirestore();
  const ref = db.collection('announcements').doc(trimmed);

  try {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: 'That announcement no longer exists.' };
    if (snap.data()?.status === 'Archived') return { ok: true };

    await ref.update({
      status: 'Archived',
      archivedBy: session.employeeId,
      archivedAt: FieldValue.serverTimestamp(),
    });

    await new FirestoreAuditLogger(db).record(
      [announcementArchived(trimmed, new EmployeeId(session.employeeId), new Date())],
      session.employeeId,
    );

    revalidatePath('/announcements');
    return { ok: true };
  } catch (error) {
    console.error('Archiving an announcement failed:', error);
    return { ok: false, error: 'Could not archive the announcement. Please try again.' };
  }
}
