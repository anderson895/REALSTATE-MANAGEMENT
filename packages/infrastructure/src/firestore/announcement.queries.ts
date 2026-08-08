import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';

/**
 * Read side of the Advertisement module.
 *
 * RBAC.xls row 9 gives Marketing Staff one job — "Upload announcement, project
 * details" — and it is the only module in the matrix no other role can write.
 *
 * ── Why the images are stored with their URL and not just a public_id ─────
 *
 * Everywhere else in this system an upload is stored as a Cloudinary
 * `public_id` and resolved through `signedUrlFor` at render time, because the
 * asset is a government ID or a receipt and must not be fetchable by URL alone.
 * These are advertisements. They live on the public CDN (`type: 'upload'`), so
 * the delivery URL Cloudinary hands back is stable, cacheable and safe to
 * store — and storing it means rendering a list of ten announcements costs no
 * signing work at all. The `public_id` is kept beside it so the asset can still
 * be deleted later.
 */

export const MAX_ANNOUNCEMENTS_PER_QUERY = 60;

export const ANNOUNCEMENT_STATUSES = ['Published', 'Archived'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface AnnouncementImage {
  readonly publicId: string;
  readonly url: string;
  readonly fileName: string;
}

export interface AnnouncementRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Optional. An announcement may be about the company rather than a project. */
  readonly projectId: string | null;
  /** Denormalised at write time, so a list of ten costs no project reads. */
  readonly projectName: string | null;
  readonly images: readonly AnnouncementImage[];
  readonly status: AnnouncementStatus;
  /** The data trail. Employee id — resolve to a name with `resolveEmployeeNames`. */
  readonly createdBy: string;
  readonly createdAt: string | null;
  readonly archivedBy: string | null;
  readonly archivedAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function toText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

function toImages(value: unknown): AnnouncementImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DocumentData => typeof item === 'object' && item !== null)
    .map((item) => ({
      publicId: String(item.publicId ?? ''),
      url: String(item.url ?? ''),
      fileName: String(item.fileName ?? ''),
    }))
    .filter((image) => image.url !== '');
}

export function toAnnouncementRow(id: string, raw: DocumentData): AnnouncementRow {
  return {
    id,
    title: String(raw.title ?? ''),
    body: String(raw.body ?? ''),
    projectId: toText(raw.projectId),
    projectName: toText(raw.projectName),
    images: toImages(raw.images),
    status: raw.status === 'Archived' ? 'Archived' : 'Published',
    createdBy: String(raw.createdBy ?? ''),
    createdAt: toIso(raw.createdAt),
    archivedBy: toText(raw.archivedBy),
    archivedAt: toIso(raw.archivedAt),
  };
}

/**
 * Announcements, newest first.
 *
 * Archived ones are included by default and drawn muted rather than removed.
 * The screen's other job is the data trail, and a trail that deletes the row
 * when the post comes down cannot answer "what was up here last week" — which
 * is the question somebody asks precisely because it came down.
 *
 * COST: one query, `limit` reads. No joins — the project name is denormalised
 * onto the document and the author's name is resolved once for the whole page.
 *
 * Deliberately unfiltered. Adding `.where('status', '==', …)` beside this
 * `orderBy` would need a composite index in firestore.indexes.json to buy a
 * split the caller can do in memory over at most 60 rows.
 */
export async function listAnnouncements(
  db: Firestore,
  limit = 25,
): Promise<AnnouncementRow[]> {
  const snap = await db
    .collection('announcements')
    .orderBy('createdAt', 'desc')
    .limit(Math.min(limit, MAX_ANNOUNCEMENTS_PER_QUERY))
    .get();

  return snap.docs.map((doc) => toAnnouncementRow(doc.id, doc.data()));
}

export async function getAnnouncement(
  db: Firestore,
  id: string,
): Promise<AnnouncementRow | null> {
  const snap = await db.collection('announcements').doc(id).get();
  const data = snap.data();
  return snap.exists && data ? toAnnouncementRow(snap.id, data) : null;
}
