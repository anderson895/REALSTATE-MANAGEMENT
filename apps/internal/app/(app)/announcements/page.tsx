import Image from 'next/image';
import { Megaphone } from 'lucide-react';
import { can } from '@sfsr/domain';
import {
  getAdminFirestore,
  listAnnouncements,
  listProjects,
  resolveEmployeeNames,
  type AnnouncementRow,
} from '@sfsr/infrastructure/server';
import { cloudinaryUrl, cn } from '@sfsr/ui';
import { requireModule, toActor } from '@/lib/session';
import { formatDate } from '@/lib/reservations';
import { ArchiveButton } from './archive-button';
import { NewAnnouncementDialog } from './new-announcement-dialog';

/**
 * Announcements — the Advertisement module.
 *
 * RBAC.xls row 9 gives Marketing Staff one job, "Upload announcement, project
 * details", and MARKETING is the only role in the matrix that holds this
 * module. Not IT: the administrator creates the Marketing account at
 * /admin/users and then cannot post with it, which is the same separation
 * note.txt applies to every other desk.
 *
 * ── The data trail ────────────────────────────────────────────────────────
 *
 * Every post carries the employee who put it up, resolved to a name, beside the
 * date. Archived posts stay on the list, greyed, carrying BOTH names — who
 * posted it and who took it down. The `auditLogs` copy is what holds if this
 * document is ever overwritten; that collection grants no role update or delete
 * (§3.6).
 *
 * ── Internal only, for now ────────────────────────────────────────────────
 *
 * `announcements` is already world-readable in firestore.rules, and the images
 * are on the public CDN, so surfacing these on the Portal later needs a page
 * and no rule change. Nothing on the buyer side reads them yet, and this screen
 * says so rather than implying a reach it does not have.
 */
export default async function AnnouncementsPage() {
  const session = await requireModule('ADVERTISEMENT');
  const actor = toActor(session);

  const db = getAdminFirestore();
  // COST: up to 25 announcements + 5 projects + one getAll for the names behind
  // createdBy/archivedBy, which is usually one or two documents.
  const [announcements, projects] = await Promise.all([
    listAnnouncements(db, 25),
    listProjects(db),
  ]);
  const names = await resolveEmployeeNames(
    db,
    announcements.flatMap((a) => [a.createdBy, a.archivedBy]),
  );

  const published = announcements.filter((a) => a.status === 'Published').length;
  const canPost = can(actor, 'ADVERTISEMENT', 'create');
  const canArchive = can(actor, 'ADVERTISEMENT', 'delete');

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-100 text-gold-900"
          >
            <Megaphone className="h-4 w-4" strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-navy-800">Announcements</h1>
        </div>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Project news and promotional material, {session.displayName.split(' ')[0]}. Every post
          records who put it up and when — including the ones taken down.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">Posted</h2>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-neutral-500">
              {announcements.length === 0
                ? 'none yet'
                : `${published} published · ${announcements.length - published} archived`}
            </span>
            {canPost ? (
              <NewAnnouncementDialog projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
            ) : null}
          </div>
        </header>

        {announcements.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-800">Nothing posted yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
              {canPost
                ? 'Use the form above. A post needs a title and details; pictures are optional.'
                : 'Marketing has not posted anything.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {announcements.map((announcement) => (
              <Post
                key={announcement.id}
                announcement={announcement}
                names={names}
                canArchive={canArchive}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        These are visible inside the Internal system only. Nothing on the buyer Portal reads them
        yet.
      </p>
    </div>
  );
}

function Post({
  announcement,
  names,
  canArchive,
}: {
  announcement: AnnouncementRow;
  /** Employee id -> full name, resolved once for the page. */
  names: Map<string, string>;
  canArchive: boolean;
}) {
  const archived = announcement.status === 'Archived';
  // The name if it resolves, the id if it does not — a deleted account must not
  // read as "nobody posted this".
  const author = names.get(announcement.createdBy) ?? announcement.createdBy;

  return (
    <li className={cn('px-5 py-4', archived && 'bg-neutral-50/60')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-semibold',
              archived ? 'text-neutral-500 line-through decoration-neutral-300' : 'text-neutral-800',
            )}
          >
            {announcement.title}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {announcement.projectName ? (
              <span className="rounded-md bg-navy-50 px-1.5 py-0.5 font-semibold text-navy-700">
                {announcement.projectName}
              </span>
            ) : null}
            {archived ? (
              <span className="rounded-md bg-neutral-200 px-1.5 py-0.5 font-semibold text-neutral-600">
                Archived
              </span>
            ) : (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                Published
              </span>
            )}
          </div>
        </div>

        {canArchive && !archived ? (
          <ArchiveButton id={announcement.id} title={announcement.title} />
        ) : null}
      </div>

      <p
        className={cn(
          'mt-2.5 whitespace-pre-wrap text-sm leading-relaxed',
          archived ? 'text-neutral-400' : 'text-neutral-600',
        )}
      >
        {announcement.body}
      </p>

      {announcement.images.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {announcement.images.map((image) => (
            <li
              key={image.publicId}
              className="relative aspect-[4/3] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
            >
              <Image
                src={cloudinaryUrl(image.url, { width: 320, height: 240, crop: 'fill' })}
                alt={image.fileName || announcement.title}
                fill
                sizes="160px"
                className={cn('object-cover', archived && 'opacity-50 grayscale')}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/*
       * The trail. Both halves when there are two: an archived post that shows
       * only who took it down loses the answer to the question more often
       * asked, which is who put it up in the first place.
       */}
      <p className="mt-3 text-[11px] text-neutral-400">
        Added by <span className="font-medium text-navy-700">{author}</span>
        {announcement.createdAt ? ` · ${formatDate(announcement.createdAt)}` : ''}
        {archived && announcement.archivedBy
          ? ` · archived by ${names.get(announcement.archivedBy) ?? announcement.archivedBy}${
              announcement.archivedAt ? ` on ${formatDate(announcement.archivedAt)}` : ''
            }`
          : ''}
      </p>
    </li>
  );
}
