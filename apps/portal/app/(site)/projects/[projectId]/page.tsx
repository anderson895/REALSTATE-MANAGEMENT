import { notFound } from 'next/navigation';
import { Money } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { StatusBadge } from '@sfsr/ui';

export const dynamic = 'force-dynamic';

interface UnitRow {
  readonly id: string;
  readonly tower: string | null;
  readonly floor: number;
  readonly unitNo: string;
  readonly unitType: string;
  readonly areaSqm: number;
  readonly price: Money;
  readonly status: string;
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const db = getAdminFirestore();

  const [projectSnap, unitsSnap] = await Promise.all([
    db.collection('projects').doc(projectId).get(),
    db.collection('units').where('projectId', '==', projectId).get(),
  ]);

  if (!projectSnap.exists) notFound();
  const project = projectSnap.data() ?? {};

  const units: UnitRow[] = unitsSnap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        tower: d.tower ? String(d.tower) : null,
        floor: Number(d.floor ?? 0),
        unitNo: String(d.unitNo ?? ''),
        unitType: String(d.unitType ?? ''),
        areaSqm: Number(d.areaSqm ?? 0),
        price: Money.fromCentavos(Number(d.purchasePriceCentavos ?? 0)),
        status: String(d.status ?? 'Available'),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // Some projects are twin-tower (Skyline), some single. Only show the column
  // when the data has it — two of the five source sheets have no Tower column.
  const hasTower = units.some((u) => u.tower !== null);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">{String(project.name ?? projectId)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{String(project.location ?? '')}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
          <Detail label="Project code" value={String(project.code ?? projectId)} />
          <Detail label="Building type" value={String(project.buildingType ?? '—')} />
          <Detail label="Floors" value={String(project.floorsRaw ?? '—')} />
          <Detail label="Developer" value={String(project.developer ?? '—')} />
        </dl>
      </header>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              {hasTower ? <th className="px-4 py-2.5 font-medium">Tower</th> : null}
              <th className="px-4 py-2.5 font-medium">Floor</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Area</th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {units.map((unit) => (
              <tr key={unit.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-4 py-2.5 font-medium">{unit.unitNo}</td>
                {hasTower ? (
                  <td className="px-4 py-2.5 text-neutral-500">{unit.tower ?? '—'}</td>
                ) : null}
                <td className="tabular px-4 py-2.5 text-neutral-500">{unit.floor}</td>
                <td className="px-4 py-2.5">{unit.unitType}</td>
                <td className="tabular px-4 py-2.5 text-right text-neutral-500">
                  {unit.areaSqm} sqm
                </td>
                <td className="tabular px-4 py-2.5 text-right font-medium">
                  {unit.price.format()}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={unit.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        {units.length} units. Availability updates in real time as reservations are verified by the
        St. Francis Square Realty team.
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
