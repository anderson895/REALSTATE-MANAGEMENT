import Link from 'next/link';
import {
  FileSearch,
  FileSignature,
  FileText,
  FileWarning,
  FileX2,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { type InternalActor } from '@sfsr/domain';
import type {
  ClientMasterfileRow,
  DocumentQueueRow,
  StatusByProject,
} from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { ACTION_LABELS, actionsFor, canTakeAction, formatDate } from '@/lib/reservations';
import {
  SUMMARY_CARDS,
  documentStatusTone,
  documentTypeTone,
  type SummaryCard,
} from '@/lib/documentation';
import { ReservationBadge } from './reservations/status';

/**
 * The Documentation Department dashboard, from INTERNAL.xls sheet
 * `USER INTERFACE`.
 *
 * Six counters across the top, the verification queue below, and the client
 * masterfile panel down the right — the sheet's layout, in its own wording.
 *
 * ── Where this departs from the sheet, and why ────────────────────────────
 *
 * The sheet's ACTION column has four buttons: View Documents, Approve, Return
 * to Buyer, Reject.
 *
 *  - "Approve" is drawn on every row regardless of state. Here it is whatever
 *    the row's status will actually accept next, from `actionsFor()` — the
 *    entity refuses an illegal transition anyway, so a button that always says
 *    Approve is a button that is sometimes a lie.
 *
 *  - "Return to Buyer" is a LINK to the record, not an inline button. Noting a
 *    deficiency needs a written reason the buyer will read, and there is
 *    nowhere to type one in a table row. The reservation queue made the same
 *    call for the same reason.
 *
 *  - "Reject" is not drawn at all. Nothing in RESERVATION.doc lets Documentation
 *    reject an application outright — a deficiency goes back to the buyer with
 *    24 hours to cure it, and only a supervisor cancels. A button wired to an
 *    action the domain does not have would fail on click, which is worse than
 *    never offering it.
 */

const TONES: Record<SummaryCard['tone'], string> = {
  navy: 'bg-navy-800',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
};

/**
 * One icon per card, keyed so a tile cannot end up wearing another's symbol.
 *
 * lucide-react rather than hand-drawn paths: the sheet's glyphs are drawn in
 * this style, and six hand-traced approximations of a standard set is six
 * chances to draw one badly. Tree-shaken, so only these six ship.
 */
const CARD_ICONS: Record<string, LucideIcon> = {
  new: FileText,
  review: FileSearch,
  incomplete: FileWarning,
  signing: FileSignature,
  cancelled: FileX2,
  clients: Users,
};

export function DocumentationDashboard({
  byStatusProject,
  clientCount,
  projects,
  queue,
  queueTotal,
  page,
  pageSize,
  actor,
  selectedClient,
  searchTerm,
  searchResults,
}: {
  byStatusProject: Record<string, StatusByProject>;
  clientCount: number;
  projects: readonly { id: string; name: string }[];
  queue: readonly DocumentQueueRow[];
  queueTotal: number;
  page: number;
  pageSize: number;
  actor: InternalActor;
  selectedClient: ClientMasterfileRow | null;
  searchTerm: string;
  searchResults: readonly ClientMasterfileRow[];
}) {
  return (
    <>
      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Project Document Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {SUMMARY_CARDS.map((card) => {
            const bucket = card.status ? byStatusProject[card.status] : undefined;
            return (
              <SummaryTile
                key={card.key}
                card={card}
                total={card.status === null ? clientCount : (bucket?.total ?? 0)}
                byProject={bucket?.byProject ?? {}}
                projects={projects}
              />
            );
          })}
        </div>
      </section>

      {/* The queue takes the width; the masterfile is a reference panel beside
          it, as in the sheet. It drops below on anything narrower than a
          desktop rather than squeezing the table to half a screen. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <DocumentQueue
          queue={queue}
          actor={actor}
          total={queueTotal}
          page={page}
          pageSize={pageSize}
        />
        <ClientMasterfile
          client={selectedClient}
          queue={queue}
          searchTerm={searchTerm}
          searchResults={searchResults}
        />
      </div>
    </>
  );
}

/**
 * One summary card: the glyph and its title, the per-project split, the total.
 *
 * The per-project list is the point of the card in the sheet, not decoration —
 * "88 incomplete requirements" tells a department nothing it can act on, and
 * "25 of them in The Legaspi Place" tells it where to go. Projects with a zero
 * are still listed, because a project that vanishes from one card and not
 * another reads as missing data rather than as nothing to do.
 */
function SummaryTile({
  card,
  total,
  byProject,
  projects,
}: {
  card: SummaryCard;
  total: number;
  byProject: Readonly<Record<string, number>>;
  projects: readonly { id: string; name: string }[];
}) {
  const Icon = CARD_ICONS[card.key] ?? Users;
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white',
            TONES[card.tone],
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <p className="text-[11px] font-bold leading-tight text-navy-800">{card.label}</p>
      </div>

      {/* The client tally has no project dimension — it counts buyers, not
          reservations — so it shows its figure and stops. */}
      {card.status === null ? (
        <p className="tabular mt-4 text-3xl font-bold leading-none text-navy-800">{total}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {projects.map((project) => (
              <li key={project.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-neutral-600">{project.name}</span>
                <span className="tabular shrink-0 font-semibold text-navy-800">
                  {byProject[project.id] ?? 0}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Total
            </span>
            <span className="tabular text-lg font-bold leading-none text-navy-800">{total}</span>
          </div>
        </>
      )}

      {card.href ? (
        <p className="mt-2.5 text-[11px] font-semibold text-navy-500 group-hover:underline">
          View details ›
        </p>
      ) : null}
    </>
  );

  const shell = 'rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5 shadow-sm';

  return card.href ? (
    <Link href={card.href} className={cn(shell, 'group transition-colors hover:border-navy-300')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

function DocumentQueue({
  queue,
  actor,
  total,
  page,
  pageSize,
}: {
  queue: readonly DocumentQueueRow[];
  actor: InternalActor;
  total: number;
  page: number;
  pageSize: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Document Verification Queue
        </h2>
        <span className="text-[11px] font-medium text-neutral-500">
          {total === 0 ? 'nothing waiting' : `${total} waiting`}
        </span>
      </header>

      {queue.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-navy-800">Nothing waiting on verification</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
            Reservations appear here as soon as a buyer submits one from the Portal.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/*
           * 46rem, not 58. The queue shares the row with the masterfile panel,
           * so it gets roughly 1000px on a laptop — a wider minimum pushed the
           * action buttons past the edge and they were reachable only by
           * scrolling a table that looked complete.
           */}
          <table className="w-full min-w-[46rem] table-fixed text-sm">
            {/* Status gets 20%: its longest label, "Awaiting payment check",
                is set nowrap so the pill keeps its shape, and at 15% it ran
                out from under the column and sat on top of the buttons. */}
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[17%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                <th scope="col" className="px-5 py-2.5 font-semibold">Reservation No.</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Buyer</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Document type</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {queue.map((row) => (
                <QueueRow key={row.number} row={row} actor={actor} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? <Pager total={total} page={page} pageSize={pageSize} /> : null}
    </section>
  );
}

/**
 * "Showing 1 to 5 of 41 entries", with the page numbers beside it.
 *
 * Plain links, not buttons: a page is a place, so it belongs in the URL where
 * it can be reloaded, bookmarked and sent to someone. It also means the pager
 * costs no JavaScript.
 *
 * The client selection is dropped when changing page on purpose — the buyer in
 * the masterfile panel came from a row that is about to leave the screen, and
 * a panel describing a record you can no longer see is worse than an empty one.
 */
function Pager({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // A window around the current page: a hundred numbered links is not a pager.
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const window = Array.from({ length: Math.min(5, pages) }, (_, i) => from + i).filter(
    (n) => n <= pages,
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/80 px-5 py-3">
      <p className="text-[11px] text-neutral-500">
        Showing {first} to {last} of {total} {total === 1 ? 'entry' : 'entries'}
      </p>

      {pages > 1 ? (
        <nav aria-label="Queue pages" className="flex items-center gap-1">
          <PageLink to={page - 1} disabled={page <= 1} label="Previous page">
            ‹
          </PageLink>
          {window.map((n) => (
            <PageLink key={n} to={n} current={n === page} label={`Page ${n}`}>
              {n}
            </PageLink>
          ))}
          <PageLink to={page + 1} disabled={page >= pages} label="Next page">
            ›
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  to,
  children,
  current,
  disabled,
  label,
}: {
  to: number;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const styles = cn(
    'flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors',
    current
      ? 'bg-navy-800 text-white'
      : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-100',
  );

  if (disabled) {
    return (
      <span aria-hidden="true" className={cn(styles, 'cursor-not-allowed opacity-40')}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`/?page=${to}`}
      scroll={false}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={styles}
    >
      {children}
    </Link>
  );
}

function QueueRow({ row, actor }: { row: DocumentQueueRow; actor: InternalActor }) {
  // The one step this row will accept next, and that this employee may take.
  // `noteDeficiency` is filtered out — it needs a written reason, so it is a
  // link to the record rather than a button here.
  const next = actionsFor(row)
    .filter((action) => action !== 'noteDeficiency')
    .filter((action) => canTakeAction(actor, action));

  return (
    <tr className="align-top transition-colors hover:bg-navy-50/60">
      <td className="tabular px-5 py-3.5">
        <Link
          href={`/reservations/${row.number}`}
          className="whitespace-nowrap font-medium text-navy-700 hover:underline"
        >
          {row.number}
        </Link>
        <p className="mt-0.5 text-[11px] text-neutral-400">{formatDate(row.reservedAt)}</p>
      </td>

      <td className="px-5 py-3.5">
        {/* Selecting a buyer fills the masterfile panel. A link rather than a
            control because it only changes what is displayed — it survives a
            reload and can be sent to someone. */}
        <Link
          href={`/?client=${encodeURIComponent(row.buyerId)}`}
          scroll={false}
          className="font-medium text-neutral-800 hover:text-navy-700 hover:underline"
        >
          {row.buyerName}
        </Link>
        <p className="mt-0.5 text-[11px] text-neutral-400">{row.unitId}</p>
      </td>

      <td className="px-5 py-3.5 text-neutral-700">{row.projectName}</td>

      <td className="px-5 py-3.5">
        {row.documentType ? (
          <>
            <TypePill type={row.documentType} />
            {row.documentStatus ? <DocumentPill status={row.documentStatus} /> : null}
          </>
        ) : (
          <span className="text-neutral-400">Not uploaded</span>
        )}
      </td>

      <td className="px-5 py-3.5">
        <ReservationBadge status={row.status} />
        {row.deficiencyReason ? (
          <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-amber-700">
            {row.deficiencyReason}
          </p>
        ) : null}
      </td>

      {/* Both actions open the record rather than acting from the row. Payment
          and documents are verified against the evidence attached to them, and
          approving from a list means approving without having looked. The
          status column already says what the row is waiting for, so it is not
          repeated under the buttons. */}
      <td className="px-5 py-3.5">
        <div className="flex flex-col items-end gap-1.5">
          {next.length === 1 && next[0] ? (
            <Link
              href={`/reservations/${row.number}`}
              className="w-full max-w-[10rem] whitespace-nowrap rounded-md bg-gold-400 px-2.5 py-1.5 text-center text-[11px] font-semibold text-navy-900 shadow-sm transition-colors hover:bg-gold-300"
            >
              {ACTION_LABELS[next[0]]}
            </Link>
          ) : null}
          <Link
            href={`/reservations/${row.number}`}
            className="w-full max-w-[10rem] whitespace-nowrap rounded-md border border-neutral-300 px-2.5 py-1.5 text-center text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            View documents
          </Link>
        </div>
      </td>
    </tr>
  );
}

/** The document type itself, coloured so the column can be scanned. */
function TypePill({ type }: { type: string }) {
  const tone = documentTypeTone(type);
  const styles =
    tone === 'sky'
      ? 'bg-sky-50 text-sky-700 ring-sky-600/20'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
        : tone === 'violet'
          ? 'bg-violet-50 text-violet-700 ring-violet-600/20'
          : tone === 'amber'
            ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
            : tone === 'rose'
              ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
              : 'bg-neutral-100 text-neutral-700 ring-neutral-500/20';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        styles,
      )}
    >
      {type}
    </span>
  );
}

function DocumentPill({ status }: { status: string }) {
  const tone = documentStatusTone(status);
  const styles =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800 ring-amber-600/20'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
          : 'bg-neutral-100 text-neutral-700 ring-neutral-500/20';

  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        styles,
      )}
    >
      {status}
    </span>
  );
}

/**
 * The reference panel down the right of the sheet.
 *
 * Opens EMPTY, with the field names and dashes — which is exactly how the sheet
 * draws it. Everything except the contact details comes from the queue row
 * already on screen, so selecting a buyer costs one read rather than a join.
 *
 * Three of the sheet's fields have no data behind them yet: Contract Status,
 * Loan Status and the Contract Signing Schedule are contract-management
 * concerns and that module is not built. They are drawn with a dash rather than
 * dropped, because the gap is the point — this is what the desk expects to see.
 */
function ClientMasterfile({
  client,
  queue,
  searchTerm,
  searchResults,
}: {
  client: ClientMasterfileRow | null;
  queue: readonly DocumentQueueRow[];
  searchTerm: string;
  searchResults: readonly ClientMasterfileRow[];
}) {
  const row = client ? (queue.find((r) => r.buyerId === client.id) ?? null) : null;

  return (
    <aside className="h-fit overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Client Masterfile
        </h2>
      </header>

      {/*
       * A GET form, so the search term lands in the URL and the results are a
       * server render — no client state, and a search can be reloaded or sent
       * to someone. `page` is deliberately not carried through: a search is a
       * different question from "page 3 of the queue".
       */}
      <form action="/" method="get" className="border-b border-neutral-200/80 px-5 py-3">
        <label htmlFor="client-search" className="sr-only">
          Search client
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
            strokeWidth={2}
          />
          <input
            id="client-search"
            name="q"
            type="search"
            defaultValue={searchTerm}
            placeholder="Search client..."
            className="w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20"
          />
        </div>
      </form>

      {searchTerm ? (
        <div className="border-b border-neutral-200/80 px-5 py-3">
          {searchResults.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-neutral-500">
              Nothing matches “{searchTerm}”. Search matches the START of a surname, username or
              email — Firestore cannot look inside a word.
            </p>
          ) : (
            <ul className="space-y-1">
              {searchResults.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/?client=${encodeURIComponent(match.id)}`}
                    scroll={false}
                    className="block truncate rounded-md px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
                  >
                    <span className="font-medium">{match.name}</span>
                    <span className="ml-1.5 text-neutral-400">{match.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="px-5 py-4">
        {client ? null : (
          <p className="mb-3 text-xs leading-relaxed text-neutral-500">
            Select a buyer in the queue, or search above.
          </p>
        )}

        <dl className="space-y-2.5 text-xs">
          <Field label="Buyer name" value={client?.name} />
          <Field label="Project" value={row?.projectName} />
          <Field label="Unit number" value={row?.unitId} />
          <Field label="Reservation no." value={row?.number} />
          <Field label="Account tier" value={client?.tier} />
          <Field label="Mobile" value={client?.mobile} />
          <Field label="Email" value={client?.email} />
          <Field label="Document status" value={row?.documentStatus} />
          <Field label="Contract status" value={null} />
          <Field label="Loan status" value={null} />
          <Field label="Contract signing schedule" value={null} />
        </dl>

        {client ? (
          <Link
            href="/"
            scroll={false}
            className="mt-4 inline-block text-[11px] font-semibold text-navy-500 hover:underline"
          >
            Clear selection
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-neutral-800">
        {value && value.trim() !== '' ? value : <span className="text-neutral-300">—</span>}
      </dd>
    </div>
  );
}
