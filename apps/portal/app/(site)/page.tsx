import Link from 'next/link';
import Image from 'next/image';
import { Money } from '@sfsr/domain';
import { ProjectPlaceholder, cloudinaryUrl } from '@sfsr/ui';
import { getCachedProjects } from '@/lib/catalog';

export default async function HomePage() {
  // COST: 5 reads on a cache miss, 0 on a hit. Counts come from the
  // denormalised `stats` field, not from scanning 150 unit documents.
  //
  // The shell reads cookies(), so this route renders dynamically and a
  // page-level `revalidate` would never fire. Caching happens at the data
  // layer instead — see lib/catalog.ts.
  const projects = await getCachedProjects();
  const totalAvailable = projects.reduce((sum, p) => sum + p.stats.availableUnits, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
          St. Francis Square Realty Corporation
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Find your home</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Browse {totalAvailable} available units across {projects.length} condominium projects.
          Create an account to schedule a site viewing, request a sample computation, and reserve
          your preferred unit online.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2">
        {projects.map((project) => {
          const startingAt = project.stats.minPriceCentavos
            ? Money.fromCentavos(project.stats.minPriceCentavos)
            : null;

          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group overflow-hidden rounded-lg border border-neutral-200 bg-white transition-colors hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="relative aspect-[3/2] bg-neutral-100 dark:bg-neutral-800">
                {project.heroImageUrl ? (
                  <Image
                    src={cloudinaryUrl(project.heroImageUrl, {
                      width: 800,
                      height: 534,
                      crop: 'fill',
                    })}
                    alt={project.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <ProjectPlaceholder name={project.name} />
                )}
                <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-700 backdrop-blur dark:bg-neutral-900/90 dark:text-brand-300">
                  {project.stats.availableUnits} available
                </span>
              </div>

              <div className="p-5">
                <h2 className="font-medium group-hover:text-brand-700 dark:group-hover:text-brand-300">
                  {project.name}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">{project.location}</p>
                {project.theme ? (
                  <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{project.theme}</p>
                ) : null}
                {startingAt ? (
                  <p className="mt-4 text-sm">
                    <span className="text-neutral-500">Starting at </span>
                    <span className="tabular font-semibold">{startingAt.format()}</span>
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </section>

      <p className="mt-8 text-xs text-neutral-400">
        Prices are computed by the shared pricing engine and are identical to what the St. Francis
        Square Realty billing team sees.
      </p>
    </div>
  );
}
