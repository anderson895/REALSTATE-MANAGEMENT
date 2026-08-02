import { Money, ROLE_LABELS, isInternalRole, modulesFor } from '@sfsr/domain';
import { StatusBadge } from '@sfsr/ui';
import { requireEmployee } from '@/lib/session';
import { getCachedProjects, getCachedUnitCounts } from '@/lib/catalog';

/**
 * COST on a cache miss: 5 reads (projects, with denormalised stats) + 3 reads
 * (count() aggregations, which bill per 1,000 index entries rather than per
 * document). Zero on a hit. Previously 152 on every single load.
 *
 * Every internal page reads the session cookie, so all of them render
 * dynamically — caching happens around the data instead (lib/catalog.ts).
 *
 * See Development Plan.md §12.30.
 */
export default async function DashboardPage() {
  const session = await requireEmployee();

  const [projects, byStatus] = await Promise.all([getCachedProjects(), getCachedUnitCounts()]);

  if (!isInternalRole(session.role)) return null;
  const modules = modulesFor(session.role);

  const totalUnits = projects.reduce((n, p) => n + p.stats.totalUnits, 0);
  const totalParking = projects.reduce((n, p) => n + p.stats.totalParking, 0);
  const inventoryValue = projects.reduce(
    (sum, p) => sum.add(Money.fromCentavos(p.stats.maxPriceCentavos ?? 0)),
    Money.zero(),
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
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

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Projects" value={String(projects.length)} />
        <Stat label="Units" value={String(totalUnits)} />
        <Stat label="Parking slots" value={String(totalParking)} />
        <Stat label="Highest unit price" value={inventoryValue.format()} tabular />
      </section>

      <section className="mb-6 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Unit inventory by status
        </h2>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {['Available', 'On Hold', 'Sold'].map((status) => (
            <li key={status} className="flex items-center justify-between px-5 py-3">
              <StatusBadge status={status} />
              <span className="tabular text-sm font-medium">{byStatus[status] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
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
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2.5">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-neutral-400">{p.id}</span>
                </td>
                <td className="tabular px-5 py-2.5 text-right">{p.stats.availableUnits}</td>
                <td className="tabular px-5 py-2.5 text-right">{p.stats.onHoldUnits}</td>
                <td className="tabular px-5 py-2.5 text-right">{p.stats.soldUnits}</td>
                <td className="tabular px-5 py-2.5 text-right text-neutral-500">
                  {p.stats.availableParking}/{p.stats.totalParking}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs text-neutral-400">
        Counts come from denormalised project stats and Firestore count() aggregations — 8 reads
        per refresh instead of 152. Every peso figure comes from the shared pricing engine in
        @sfsr/domain, the same code the Portal uses.
      </p>
    </div>
  );
}

function Stat({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tabular ? 'tabular' : ''}`}>{value}</p>
    </div>
  );
}
