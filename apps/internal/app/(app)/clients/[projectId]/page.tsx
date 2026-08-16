import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { SALES_VISIBLE_STATUSES, type ReservationStatus } from '@sfsr/domain';
import { getAdminFirestore, getProject, listProjectMasterfiles } from '@sfsr/infrastructure/server';
import { requireModule } from '@/lib/session';
import { STATUS_LABELS, formatDate } from '@/lib/reservations';
import { BuyerSearch, type BuyerRow } from './buyer-search';

/**
 * Client Master Files, page two — one project's buyers.
 *
 * note.txt: "pagka pili ng project meron lang search field (unity number or
 * buyers name), meron din count ng unit sold."
 *
 * The count and the search operate on the same set: every APPROVED reservation
 * in this project. "Units sold" is therefore that set's size rather than a
 * separately maintained number, which is the only way the two can agree.
 *
 * Rows are formatted HERE and handed to the client component as strings —
 * `formatDate` and `STATUS_LABELS` come from a module that reaches into
 * `@sfsr/infrastructure/server`, so neither can cross into the browser.
 */
export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(getAdminFirestore(), projectId);
  return { title: project ? `${project.name} — Client Master Files` : 'Client Master Files' };
}

export default async function ProjectMasterFilesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireModule('CLIENT_PROFILE');
  const { projectId } = await params;

  const db = getAdminFirestore();
  const [project, masterfiles] = await Promise.all([
    getProject(db, projectId),
    listProjectMasterfiles(db, projectId, SALES_VISIBLE_STATUSES),
  ]);

  if (!project) notFound();

  const rows: BuyerRow[] = masterfiles.map((row) => ({
    number: row.number,
    clientId: row.clientId,
    buyerName: row.buyerName,
    username: row.username,
    unitNo: row.unitNo,
    unitType: row.unitType,
    source: row.source,
    statusLabel: STATUS_LABELS[row.status as ReservationStatus] ?? row.status,
    approvedLabel: row.approvedAt ? formatDate(row.approvedAt) : null,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/clients"
        className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-navy-700"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        All projects
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">{project.name}</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 text-sm text-neutral-500">
          {project.location || '—'} · {rows.length} {rows.length === 1 ? 'unit' : 'units'} sold
        </p>
      </header>

      <BuyerSearch rows={rows} projectId={projectId} />
    </div>
  );
}
