import { Money, ROLE_LABELS, canAccessModule, isInternalRole, modulesFor } from '@sfsr/domain';
import { Card, StatusBadge } from '@sfsr/ui';
import { requireEmployee, toActor } from '@/lib/session';
import { getAnalytics } from '@/lib/analytics';
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
 */
export default async function DashboardPage() {
  const session = await requireEmployee();
  if (!isInternalRole(session.role)) return null;

  const data = await getAnalytics();
  const showCharts = canAccessModule(toActor(session), 'ANALYTICS');
  const modules = modulesFor(session.role);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {ROLE_LABELS[session.role]}
          {session.isSupervisor ? ' · Approver' : ''} · {session.employeeId} · {modules.length}{' '}
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
          <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
            Unit inventory by status
          </h2>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
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
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
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
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
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
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-400">{note}</p>
      </div>
      <div className="px-3 py-4">{children}</div>
    </Card>
  );
}
