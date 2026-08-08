import { Info } from 'lucide-react';
import { ROLE_LABELS, can, canAccessModule, isInternalRole, modulesFor } from '@sfsr/domain';
import {
  countClients,
  countDocumentQueue,
  countReservationsByStatusAndProject,
  getAdminFirestore,
  getClientMasterfile,
  listAnnouncements,
  listDocumentQueue,
  listPaymentQueue,
  listProjects,
  sumCollectedCentavos,
  searchClients,
} from '@sfsr/infrastructure/server';
import { Card } from '@sfsr/ui';
import { requireEmployee, toActor } from '@/lib/session';
import { navigationFor } from '@/lib/navigation';
import { getAnalytics } from '@/lib/analytics';
import { getInventoryTrend } from '@/lib/inventory-trend';
import { DOCUMENT_QUEUE_STATUSES, SUMMARY_CARDS } from '@/lib/documentation';
import { BILLING_CARDS, PAYMENT_QUEUE_STATUSES } from '@/lib/billing';
import { AnnouncementsPanel } from './announcements-panel';
import { BillingDashboard } from './billing-dashboard';
import { DocumentationDashboard } from './documentation-dashboard';
import { InventoryDashboard } from './inventory-dashboard';
import { ModuleLauncher } from './module-launcher';
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

  const actor = toActor(session);
  const modules = modulesFor(session.role);

  /*
   * What this role may see decides what is FETCHED, not merely what is drawn.
   *
   * Gating only the rendering would hide the panels and still read every figure
   * behind them on every page view — paying count() aggregations out of a
   * 50,000/day quota to build something nobody is shown. Asking the matrix
   * first is both the control and the cheaper path.
   */
  const canSeeInventory = canAccessModule(actor, 'UNIT_INVENTORY');
  const showAnalytics = canAccessModule(actor, 'ANALYTICS');

  // Everyone, whatever their role. An announcement is a notice to all staff and
  // `announcements` is world-readable — see the panel for why it is not gated.
  const announcements = await listAnnouncements(getAdminFirestore(), 4);

  /*
   * The landing screen for a role with no grant over stock or reporting —
   * Accounting, Cash, Legal, Loans and IT.
   *
   * It offers the modules that role actually holds instead of a sales dashboard
   * it has no business reading. note.txt strips the administrator of exactly
   * this — "restrict sales, restrict finance" — and permissions.ts says so
   * outright: "Deliberately NOT granted: DASHBOARD and ANALYTICS. Both report
   * on sales and collections, which is business data." This page was showing it
   * anyway, because `/` is where everyone lands and it never asked the matrix.
   */
  if (!canSeeInventory && !showAnalytics) {
    return (
      <DashboardShell session={session} moduleCount={modules.length}>
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ModuleLauncher
              sections={navigationFor(session.role)}
              roleLabel={ROLE_LABELS[session.role]}
            />
          </div>
          <AnnouncementsPanel announcements={announcements} className="lg:col-span-4" />
        </div>
      </DashboardShell>
    );
  }

  /*
   * Two more reads, both bounded.
   *
   * The trend has its own six-hour cache rather than sharing the dashboard's
   * sixty seconds — it is the only figure here that reads a collection instead
   * of counting one. See lib/inventory-trend.ts for the arithmetic.
   */
  const data = await getAnalytics();
  const trend = canSeeInventory
    ? await getInventoryTrend({
        available: data.available,
        onHold: data.onHold,
        sold: data.sold,
      })
    : null;

  return (
    <DashboardShell session={session} moduleCount={modules.length}>
      {canSeeInventory && trend ? (
        <InventoryDashboard
          data={data}
          trend={trend}
          announcements={announcements}
          // Each drawn from its own GRANT, not from the role. Marketing holds
          // `create` on UNIT_INVENTORY and on ADVERTISEMENT; Sales and Account
          // Receivables hold the module view-and-print and get the same figures
          // with no buttons under them.
          canAddStock={can(actor, 'UNIT_INVENTORY', 'create')}
          canPostAnnouncement={can(actor, 'ADVERTISEMENT', 'create')}
          canSeeReports={canAccessModule(actor, 'REPORTS')}
        />
      ) : (
        // ANALYTICS without UNIT_INVENTORY. No role sits here today, and the
        // charts below still render — this keeps the announcements visible
        // rather than dropping them because of a combination nobody has.
        <AnnouncementsPanel announcements={announcements} className="max-w-md" />
      )}

      {/*
       * The four analytics charts, kept and moved below the fold.
       *
       * They are gated on ANALYTICS, which only Account Receivables holds, and
       * they answer a different question from the panels above: those are the
       * current position, these are its shape. Deleting them to match a mockup
       * that does not draw them would take the reservation pipeline and the
       * price spread with it, and nothing else in the system reports either.
       */}
      {showAnalytics ? (
        <section className="mt-8">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">
            Analytics
          </h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartPanel title="Inventory mix" note="Live count() aggregations across all projects.">
              <InventoryDonut data={data.inventoryMix} />
            </ChartPanel>

            <ChartPanel
              title="Reservation pipeline"
              note="Where every live application currently sits."
            >
              <PipelineChart data={data.pipeline} />
            </ChartPanel>

            <ChartPanel
              title="Units by project"
              note="Stacked, so the bar height is the project's total inventory."
            >
              <ProjectStackedBar data={data.byProject} />
            </ChartPanel>

            <ChartPanel
              title="Price range by project"
              note="Cheapest and dearest unit currently listed."
            >
              <PriceRangeBar data={data.priceByProject} />
            </ChartPanel>
          </div>
        </section>
      ) : null}

      <p className="mt-6 flex gap-2 rounded-xl border border-neutral-200/80 bg-white px-5 py-3.5 text-xs leading-relaxed text-neutral-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} aria-hidden="true" />
        <span>
          Unit counts are live count() aggregations — 15 reads per refresh rather than 150 — cached
          for 60 seconds and tagged to the inventory, so verifying a payment or approving a
          reservation refreshes them immediately. Every peso figure comes from the shared pricing
          engine in @sfsr/domain, the same code the Portal uses.
        </span>
      </p>
    </DashboardShell>
  );
}

/**
 * The greeting, shared by both landings.
 *
 * Extracted so the two branches cannot drift into two different welcomes — the
 * header is the one part of the dashboard that is the same for a Cash Clerk and
 * a Marketing Staff, because it describes the PERSON rather than the data.
 */
function DashboardShell({
  session,
  moduleCount,
  children,
}: {
  session: { displayName: string; role: string; isSupervisor: boolean; employeeId: string };
  moduleCount: number;
  children: React.ReactNode;
}) {
  const roleLabel = isInternalRole(session.role) ? ROLE_LABELS[session.role] : session.role;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">
          {/* split(' '), not split('') — the empty separator splits a string
              into CHARACTERS, so "Joanna Flores" was greeted as "J". */}
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 text-sm text-neutral-500">
          {/* Rank always, both ways round. This read "· Approver" or nothing at
              all, so staff were never told their rank — and "Approver"
              overstates it: a Billing supervisor holds the flag but approves no
              reservations. The rank is the fact; what it grants differs by desk
              and is spelled out on the profile page. */}
          {roleLabel} · {session.isSupervisor ? 'Supervisor' : 'Staff'} · {session.employeeId} ·{' '}
          {moduleCount} module{moduleCount === 1 ? '' : 's'} available to this role.
        </p>
      </header>

      {children}
    </div>
  );
}

function ChartPanel({
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
