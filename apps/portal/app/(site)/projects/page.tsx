import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import { ProjectPlaceholder, cloudinaryUrl } from '@sfsr/ui';
import { getCachedProjects } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Condominium Projects' };

export default async function ProjectsPage() {
  // COST: 5 reads on a cache miss, 0 on a hit. Previously 155 every time.
  const projects = await getCachedProjects();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Condominium Projects</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {projects.length} projects developed by St. Francis Square Realty Corporation.
        </p>
      </header>

      <div className="space-y-4">
        {projects.map((project) => {
          const low = project.stats.minPriceCentavos
            ? Money.fromCentavos(project.stats.minPriceCentavos)
            : null;
          const high = project.stats.maxPriceCentavos
            ? Money.fromCentavos(project.stats.maxPriceCentavos)
            : null;

          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex gap-5 overflow-hidden rounded-lg border border-neutral-200 bg-white transition-colors hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="relative hidden w-48 shrink-0 bg-neutral-100 sm:block dark:bg-neutral-800">
                {project.heroImageUrl ? (
                  <Image
                    src={cloudinaryUrl(project.heroImageUrl, {
                      width: 384,
                      height: 288,
                      crop: 'fill',
                    })}
                    alt={project.name}
                    fill
                    sizes="192px"
                    className="object-cover"
                  />
                ) : (
                  <ProjectPlaceholder name={project.name} />
                )}
              </div>

              <div className="flex flex-1 flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                  <h2 className="font-medium">{project.name}</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">{project.location}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {project.buildingType}
                    {project.floors ? ` · ${project.floors} floors` : ''}
                  </p>
                  {project.stats.unitTypes.length > 0 ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {project.stats.unitTypes.join(' · ')}
                    </p>
                  ) : null}
                </div>

                <div className="text-right">
                  {low && high ? (
                    <p className="tabular text-sm font-semibold">
                      {low.format()}
                      <span className="font-normal text-neutral-400"> – </span>
                      {high.format()}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-neutral-500">
                    <span className="font-medium text-brand-700 dark:text-brand-300">
                      {project.stats.availableUnits}
                    </span>{' '}
                    of {project.stats.totalUnits} units available
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {project.stats.availableParking} of {project.stats.totalParking} parking slots
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
