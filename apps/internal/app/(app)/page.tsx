import { Money, ROLE_LABELS, isInternalRole, modulesFor } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { StatusBadge } from '@sfsr/ui';
import { requireEmployee } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface InventorySnapshot {
  readonly byStatus: Record<string, number>;
  readonly totalValue: Money;
  readonly projects: number;
  readonly parking: number;
}

async function loadInventory(): Promise<InventorySnapshot> {
  const db = getAdminFirestore();
  const [units, projects, parking] = await Promise.all([
    db.collection('units').get(),
    db.collection('projects').count().get(),
    db.collection('parkingSlots').count().get(),
  ]);

  const byStatus: Record<string, number> = {};
  let totalValue = Money.zero();

  for (const doc of units.docs) {
    const data = doc.data();
    const status = String(data.status ?? 'Available');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    totalValue = totalValue.add(Money.fromCentavos(Number(data.purchasePriceCentavos ?? 0)));
  }

  return {
    byStatus,
    totalValue,
    projects: projects.data().count,
    parking: parking.data().count,
  };
}

export default async function DashboardPage() {
  const session = await requireEmployee();
  const inventory = await loadInventory();

  if (!isInternalRole(session.role)) return null;
  const modules = modulesFor(session.role);
  const totalUnits = Object.values(inventory.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Signed in as {session.employeeId} — {ROLE_LABELS[session.role]}
          {session.isSupervisor ? ' (approver)' : ''}. {modules.length} module
          {modules.length === 1 ? '' : 's'} available to this role.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Projects" value={String(inventory.projects)} />
        <Stat label="Units" value={String(totalUnits)} />
        <Stat label="Parking slots" value={String(inventory.parking)} />
        <Stat label="Inventory value" value={inventory.totalValue.format()} tabular />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
          Unit inventory by status
        </h2>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {['Available', 'On Hold', 'Sold'].map((status) => (
            <li key={status} className="flex items-center justify-between px-5 py-3">
              <StatusBadge status={status} />
              <span className="tabular text-sm font-medium">{inventory.byStatus[status] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-neutral-400">
        Figures read live from Firestore. Every peso figure on this page comes from the shared
        pricing engine in @sfsr/domain — the same code the Portal uses.
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
