import Link from 'next/link';
import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';

export const metadata: Metadata = { title: 'Condominium Projects' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const db = getAdminFirestore();
  const [projects, units] = await Promise.all([
    db.collection('projects').get(),
    db.collection('units').get(),
  ]);

  const rows = projects.docs
    .map((doc) => {
      const data = doc.data();
      const mine = units.docs.filter((u) => u.data().projectId === doc.id);
      const available = mine.filter((u) => u.data().status === 'Available');
      const prices = mine.map((u) => Number(u.data().purchasePriceCentavos ?? 0)).filter((n) => n > 0);

      return {
        id: doc.id,
        name: String(data.name ?? doc.id),
        location: String(data.location ?? ''),
        buildingType: String(data.buildingType ?? ''),
        floors: String(data.floorsRaw ?? ''),
        total: mine.length,
        available: available.length,
        low: prices.length ? Money.fromCentavos(Math.min(...prices)) : null,
        high: prices.length ? Money.fromCentavos(Math.max(...prices)) : null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Condominium Projects</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {rows.length} projects developed by St. Francis Square Realty Corporation.
        </p>
      </header>

      <div className="space-y-4">
        {rows.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-medium">{project.name}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">{project.location}</p>
                <p className="mt-2 text-xs text-neutral-500">
                  {project.buildingType}
                  {project.floors ? ` · ${project.floors} floors` : ''}
                </p>
              </div>

              <div className="text-right">
                {project.low && project.high ? (
                  <p className="tabular text-sm font-semibold">
                    {project.low.format()}
                    <span className="font-normal text-neutral-400"> – </span>
                    {project.high.format()}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-neutral-500">
                  <span className="font-medium text-brand-700 dark:text-brand-300">
                    {project.available}
                  </span>{' '}
                  of {project.total} units available
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
