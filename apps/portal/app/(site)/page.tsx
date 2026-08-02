import Link from 'next/link';
import { Money } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';

export const dynamic = 'force-dynamic';

interface ProjectCard {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly theme: string;
  readonly available: number;
  readonly startingAt: Money | null;
}

async function loadProjects(): Promise<ProjectCard[]> {
  const db = getAdminFirestore();
  const [projects, units] = await Promise.all([
    db.collection('projects').get(),
    db.collection('units').where('status', '==', 'Available').get(),
  ]);

  return projects.docs
    .map((doc) => {
      const data = doc.data();
      const mine = units.docs.filter((u) => u.data().projectId === doc.id);
      const prices = mine.map((u) => Number(u.data().purchasePriceCentavos ?? 0)).filter((n) => n > 0);

      return {
        id: doc.id,
        name: String(data.name ?? doc.id),
        location: String(data.location ?? ''),
        theme: String(data.theme ?? ''),
        available: mine.length,
        startingAt: prices.length > 0 ? Money.fromCentavos(Math.min(...prices)) : null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export default async function HomePage() {
  const projects = await loadProjects();
  const totalAvailable = projects.reduce((sum, p) => sum + p.available, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
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

      <section className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="group rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-medium group-hover:text-brand-700 dark:group-hover:text-brand-300">
                  {project.name}
                </h2>
                <p className="mt-0.5 truncate text-xs text-neutral-500">{project.location}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {project.available} available
              </span>
            </div>

            {project.theme ? (
              <p className="mt-3 text-xs text-neutral-500">{project.theme}</p>
            ) : null}

            {project.startingAt ? (
              <p className="mt-4 text-sm">
                <span className="text-neutral-500">Starting at </span>
                <span className="tabular font-semibold">{project.startingAt.format()}</span>
              </p>
            ) : null}
          </Link>
        ))}
      </section>

      <p className="mt-8 text-xs text-neutral-400">
        Prices are computed by the shared pricing engine and are identical to what the St. Francis
        Square Realty billing team sees.
      </p>
    </div>
  );
}
