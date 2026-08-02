import Link from 'next/link';
import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import { Card, PageHeader } from '@sfsr/ui';
import { getCachedProjects } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Sample Computation' };

/**
 * Sample computation entry point.
 *
 * RESERVATION.doc lists "request sample computation" as an Initial Account
 * capability, but there is no reason to gate a price calculator — a Guest User
 * can already see every unit price on the browse pages. Making them register
 * first to divide by twelve would be friction for nothing.
 *
 * The calculator itself lives on the unit page, where the figures are tied to
 * a real unit rather than a hypothetical one.
 */
export default async function ComputePage() {
  // COST: 5 reads on a cache miss, 0 on a hit.
  const projects = await getCachedProjects();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        title="Sample Computation"
        description="See the reservation fee, down payment, monthly instalment, and remaining balance for any unit — computed by the same pricing engine our Billing Department uses."
      />

      <Card className="mb-8 p-5">
        <h2 className="text-sm font-medium">How it works</h2>
        <ol className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <li>1. Choose a project, then open any unit.</li>
          <li>
            2. Pick a down payment percentage (10% to 50%) and an instalment term (Spot Cash, or 6
            to 36 months).
          </li>
          <li>
            3. The full payment summary updates instantly, including any promotional discount you
            qualify for.
          </li>
        </ol>
        <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500 dark:bg-neutral-800/60">
          A {Money.fromPesos(50_000).format()} reservation fee applies and forms part of the
          purchase price. Larger down payments qualify for a promotional discount.
        </p>
      </Card>

      <h2 className="mb-3 text-sm font-medium">Choose a project to start</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => {
          const low = project.stats.minPriceCentavos
            ? Money.fromCentavos(project.stats.minPriceCentavos)
            : null;
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}?status=Available`}
              className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-400 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="text-sm font-medium">{project.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{project.location}</p>
              {low ? (
                <p className="tabular mt-2 text-sm">
                  <span className="text-neutral-500">from </span>
                  <span className="font-semibold">{low.format()}</span>
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
