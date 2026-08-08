import { Money, ROLE_LABELS, canAccessModule, isInternalRole, modulesFor } from '@sfsr/domain';
import {
  countClients,
  countDocumentQueue,
  countReservationsByStatusAndProject,
  getAdminFirestore,
  getClientMasterfile,
  listDocumentQueue,
  listPaymentQueue,
  listProjects,
  sumCollectedCentavos,
  searchClients,
} from '@sfsr/infrastructure/server';
import { Card, StatusBadge } from '@sfsr/ui';
import { requireEmployee, toActor } from '@/lib/session';
import { getAnalytics } from '@/lib/analytics';
import { DOCUMENT_QUEUE_STATUSES, SUMMARY_CARDS } from '@/lib/documentation';
import { BILLING_CARDS, PAYMENT_QUEUE_STATUSES } from '@/lib/billing';
import { BillingDashboard } from './billing-dashboard';
import { DocumentationDashboard } from './documentation-dashboard';
import {
  InventoryDonut,
  PipelineChart,
  PriceRangeBar,
  ProjectStackedBar,
} from './dashboard-charts';

/**
 * Dashboard — the landing page for every signed-in employee.
 *
 * Analytics used to be a second page. It is folded in here because the two
 * were reporting the same inventory from two different sources and disagreeing
 * in public: the tables read live count() aggregations while the charts summed
 * the denormalised project `stats`, which nothing in the reservation workflow
 * maintains. One page, one query, one set of numbers.
 *
 * The charts are gated on the ANALYTICS grant rather than the page, because
 * `/` is where `requireModule()` sends anyone it turns away — gating the route
 * itself would bounce a denied user into a redirect loop. Everyone lands here;
 * what they see depends on the matrix.
 *
 * COST on a cache miss: 5 reads (project names, prices, parking) + 15 count()
 * aggregations + one per recent reservation. Zero on a hit. See lib/analytics.
 *
 * ── Why this page branches on role ────────────────────────────────────────
 *
 * INTERNAL.xls sheet `USER INTERFACE` does not draw one dashboard, it draws
 * five — Documentation, Billing, Account Receivables and Sales each get their
 * own, titled for the department. They share the shell and nothing else: a
 * Documentation Staff opens on a verification queue, not on unit inventory.
 *
 * So `/` resolves to the dashboard for the signed-in role. The inventory view
 * below stays the default for every role whose screen is not drawn yet, which
 * keeps `/` a landing page that works for everyone — the thing `requireModule()`
 * depends on when it turns someone away.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; page?: string; q?: string }>;
}) {
  const session = await requireEmployee();
  if (!isInternalRole(session.role)) return null;

  if (session.role === 'DOCUMENTATION') {
    const params = await searchParams;
    return (
      <DocumentationView
        clientId={params.client ?? ''}
        page={Number(params.page) || 1}
        searchTerm={(params.q ?? '').trim()}
      />
    );
  }

  if (session.role === 'BILLING') {
    return <BillingView />;
  }

  const data = await getAnalytics();
  const showCharts = canAccessModule(toActor(session), 'ANALYTICS');
  const modules = modulesFor(session.role);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">
          {/* split(' '), not split('') — the empty separator splits a string
              into CHARACTERS, so "Joanna Flores" was greeted as "J". */}
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {/* Rank always, both ways round. This read "· Approver" or nothing
              at all, so staff were never told their rank — and "Approver" now
              overstates it: a Billing supervisor holds the flag but approves
              no reservations. The rank is the fact; what it grants differs by
              desk and is spelled out on the profile page. */}
          {ROLE_LABELS[session.role]} · {session.isSupervisor ? 'Supervisor' : 'Staff'} ·{' '}
          {session.employeeId} · {modules.length}{' '}
          module{modules.length === 1 ? '' : 's'} available to this role.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Projects" value={String(data.projectCount)} />
        <Stat label="Units" value={String(data.totalUnits)} />
        <Stat label="Parking slots" value={String(data.totalParking)} />
        <Stat
          label="Highest unit price"
          value={Money.fromCentavos(data.highestPriceCentavos).format()}
        />
      </section>

      {showCharts ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Available" value={String(data.available)} tone="text-emerald-600" />
            <Stat label="On hold" value={String(data.onHold)} tone="text-amber-600" />
            <Stat
              label="Sell-through"
              value={`${data.sellThroughPct}%`}
              hint="Held or sold, of all units"
            />
            <Stat
              label="Active reservations"
              value={String(data.activeReservations)}
              hint="Excludes expired and cancelled"
            />
          </section>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Inventory mix" note="Live count() aggregations across all projects.">
              <InventoryDonut data={data.inventoryMix} />
            </Panel>

            <Panel
              title="Reservation pipeline"
              note="Where every live application currently sits."
            >
              <PipelineChart data={data.pipeline} />
            </Panel>

            <Panel
              title="Units by project"
              note="Stacked, so the bar height is the project's total inventory."
            >
              <ProjectStackedBar data={data.byProject} />
            </Panel>

            <Panel
              title="Price range by project"
              note="Cheapest and dearest unit currently listed."
            >
              <PriceRangeBar data={data.priceByProject} />
            </Panel>
          </div>
        </>
      ) : (
        // No ANALYTICS grant: the same inventory position, without the charts.
        <Card className="mb-6">
          <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">
            Unit inventory by status
          </h2>
          <ul className="divide-y divide-neutral-100">
            {(
              [
                ['Available', data.available],
                ['On Hold', data.onHold],
                ['Sold', data.sold],
              ] as const
            ).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between px-5 py-3">
                <StatusBadge status={status} />
                <span className="tabular text-sm font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium">
          By project
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-5 py-2 font-medium">Project</th>
              <th className="px-5 py-2 text-right font-medium">Available</th>
              <th className="px-5 py-2 text-right font-medium">On Hold</th>
              <th className="px-5 py-2 text-right font-medium">Sold</th>
              <th className="px-5 py-2 text-right font-medium">Parking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {data.projects.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2.5">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-neutral-400">{p.id}</span>
                </td>
                <td className="tabular px-5 py-2.5 text-right">{p.available}</td>
                <td className="tabular px-5 py-2.5 text-right">{p.onHold}</td>
                <td className="tabular px-5 py-2.5 text-right">{p.sold}</td>
                <td className="tabular px-5 py-2.5 text-right text-neutral-500">
                  {p.availableParking}/{p.totalParking}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-6 text-xs text-neutral-400">
        Unit counts are live count() aggregations — 15 reads per refresh rather than 150 — cached
        for 60 seconds and tagged to the inventory, so verifying a payment or approving a
        reservation refreshes them immediately. Every peso figure comes from the shared pricing
        engine in @sfsr/domain, the same code the Portal uses.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`tabular mt-1 text-lg font-semibold ${tone ?? ''}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-neutral-400">{hint}</p> : null}
    </Card>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="border-b border-neutral-200 px-5 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-400">{note}</p>
      </div>
      <div className="px-3 py-4">{children}</div>
    </Card>
  );
}

/**
 * The Documentation Department's landing screen.
 *
 * Split out rather than inlined into the branch above so the read budget is
 * visible in one place.
 *
 * COST: 5 project names, then one count() per (card status x project) — 25 of
 * them for the sheet's five cards and five projects — plus 1 for the client
 * tally. Then the queue join: up to 25 reservations, their distinct units and
 * buyers in two `getAll` round trips, and one `in` query for the documents. One
 * further read when a buyer is selected.
 *
 * All of it flat. Nothing here grows as the reservation collection does, which
 * is the rule the per-project counters were built around — see
 * `countReservationsByStatusAndProject`.
 *
 * Uncached, unlike the analytics snapshot: this is a work queue, and a reviewer
 * who verifies a payment must not find the row still sitting here on the way
 * back.
 */
async function DocumentationView({
  clientId,
  page,
  searchTerm,
}: {
  clientId: string;
  page: number;
  searchTerm: string;
}) {
  const db = getAdminFirestore();
  const session = await requireEmployee();

  // The cards' statuses, taken from the card table itself so a new card cannot
  // be added without its aggregation following it.
  const cardStatuses = SUMMARY_CARDS.map((c) => c.status).filter((s) => s !== null);

  const projects = await listProjects(db);
  const projectIds = projects.map((p) => p.id);

  const [byStatusProject, clientCount, queue, queueTotal, selectedClient, searchResults] =
    await Promise.all([
      countReservationsByStatusAndProject(db, cardStatuses, projectIds),
      countClients(db),
      listDocumentQueue(db, DOCUMENT_QUEUE_STATUSES, QUEUE_PAGE_SIZE, page),
      countDocumentQueue(db, DOCUMENT_QUEUE_STATUSES),
      clientId ? getClientMasterfile(db, clientId) : Promise.resolve(null),
      searchTerm ? searchClients(db, searchTerm) : Promise.resolve([]),
    ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">
          Documentation Department Dashboard
        </h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Welcome back, {session.displayName.split(' ')[0]}. Reservations waiting on payment and
          documentary verification, oldest first.
        </p>
      </header>

      <DocumentationDashboard
        byStatusProject={byStatusProject}
        clientCount={clientCount}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        queue={queue}
        queueTotal={queueTotal}
        page={page}
        pageSize={QUEUE_PAGE_SIZE}
        actor={toActor(session)}
        selectedClient={selectedClient}
        searchTerm={searchTerm}
        searchResults={searchResults}
      />
    </div>
  );
}

/**
 * Rows per page in the document verification queue.
 *
 * Named because the pager quotes it back — "Showing 1 to 5 of 41" has to agree
 * with the query that fetched those five.
 */
const QUEUE_PAGE_SIZE = 10;

/**
 * The Billing Section's landing screen.
 *
 * COST: one count() per (card status x project) — 30 for six cards and five
 * projects — plus the queue join and one bounded pass for the collections
 * total. Flat: nothing here grows with the reservation collection.
 *
 * Uncached, like the Documentation queue. A clerk who has just cleared a
 * payment must not find the row still sitting here on the way back.
 */
async function BillingView() {
  const db = getAdminFirestore();
  const session = await requireEmployee();

  const cardStatuses = BILLING_CARDS.map((c) => c.status).filter((s) => s !== null);

  const projects = await listProjects(db);
  const projectIds = projects.map((p) => p.id);

  const [byStatusProject, queue, collectedCentavos] = await Promise.all([
    countReservationsByStatusAndProject(db, cardStatuses, projectIds),
    listPaymentQueue(db, PAYMENT_QUEUE_STATUSES, 25),
    sumCollectedCentavos(db),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">
          Billing Department Dashboard
        </h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Welcome back, {session.displayName.split(' ')[0]}. Billing operations and collections
          across all projects.
        </p>
      </header>

      <BillingDashboard
        byStatusProject={byStatusProject}
        collectedCentavos={collectedCentavos}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        queue={queue}
        actor={toActor(session)}
      />
    </div>
  );
}
