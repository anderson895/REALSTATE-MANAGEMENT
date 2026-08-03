import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money } from '@sfsr/domain';
import { StatusBadge, cloudinaryUrl } from '@sfsr/ui';
import { filterUnits, getCachedProject, getCachedUnits } from '@/lib/catalog';
import { UnitFilters } from './unit-filters';

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getCachedProject(projectId);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const filters = {
    tower: first(query.tower),
    unitType: first(query.type),
    status: first(query.status),
  };

  // COST on a cache miss: 1 read for the project + one per unit in it (at most
  // 30). Zero on a hit — and every filter combination hits the SAME entry,
  // because the whole project is cached once and narrowed in memory below.
  const [project, allUnits] = await Promise.all([
    getCachedProject(projectId),
    getCachedUnits(projectId),
  ]);

  if (!project) notFound();

  const units = filterUnits(allUnits, filters);

  // Read from the UNFILTERED set: whether this project has towers is a fact
  // about the project, not about the current filter. Deriving it from the
  // filtered rows made the Tower column vanish the moment someone filtered to
  // a type that happens to sit in one tower.
  const hasTower = allUnits.some((u) => u.tower !== null);
  const filtered = Boolean(filters.tower ?? filters.unitType ?? filters.status);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {project.heroImageUrl ? (
        <div className="relative mb-8 aspect-[21/9] overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          <Image
            src={cloudinaryUrl(project.heroImageUrl, { width: 1400, height: 600, crop: 'fill' })}
            alt={project.name}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      <header className="mb-8">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">{project.location}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
          <Detail label="Project code" value={project.code} />
          <Detail label="Building type" value={project.buildingType || '—'} />
          <Detail label="Floors" value={project.floors || '—'} />
          <Detail label="Developer" value={project.developer || '—'} />
          <Detail
            label="Availability"
            value={`${project.stats.availableUnits} of ${project.stats.totalUnits} units`}
          />
        </dl>
      </header>

      {Object.keys(project.floorPlans).length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Floor plans</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(project.floorPlans).map(([unitType, url]) => (
              <a
                key={unitType}
                href={cloudinaryUrl(url, { width: 1400 })}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="relative aspect-square bg-neutral-50 dark:bg-neutral-800">
                  <Image
                    src={cloudinaryUrl(url, { width: 400, height: 400, crop: 'fit' })}
                    alt={`${unitType} floor plan`}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-contain p-1"
                  />
                </div>
                <p className="border-t border-neutral-100 px-2 py-1.5 text-center text-xs text-neutral-600 group-hover:text-brand-700 dark:border-neutral-800 dark:text-neutral-400">
                  {unitType}
                </p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <UnitFilters
        projectId={project.id}
        current={{ tower: filters.tower, type: filters.unitType, status: filters.status }}
        towers={hasTower ? ['Tower A', 'Tower B'] : []}
        unitTypes={project.stats.unitTypes}
      />

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
                <td className="px-4 py-2.5 font-medium">
                  <Link
                    href={`/units/${unit.id}`}
                    className="text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {unit.unitNo}
                  </Link>
                </td>
                {hasTower ? (
                  <td className="px-4 py-2.5 text-neutral-500">{unit.tower ?? '—'}</td>
                ) : null}
                <td className="tabular px-4 py-2.5 text-neutral-500">{unit.floor}</td>
                <td className="px-4 py-2.5">{unit.unitType}</td>
                <td className="tabular px-4 py-2.5 text-right text-neutral-500">
                  {unit.areaSqm} sqm
                </td>
                <td className="tabular px-4 py-2.5 text-right font-medium">
                  {Money.fromCentavos(unit.purchasePriceCentavos).format()}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={unit.status} />
                </td>
              </tr>
            ))}
            {units.length === 0 ? (
              <tr>
                <td colSpan={hasTower ? 7 : 6} className="px-4 py-8 text-center text-sm text-neutral-500">
                  No units match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        {units.length} unit{units.length === 1 ? '' : 's'}
        {filtered ? ' matching your filters' : ''}. Availability updates as reservations are
        verified by the St. Francis Square Realty team.
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
