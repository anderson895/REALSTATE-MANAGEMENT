import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';
import { SALES_VISIBLE_STATUSES } from '@sfsr/domain';
import { getAdminFirestore, listMasterfileProjects } from '@sfsr/infrastructure/server';
import { requireModule } from '@/lib/session';

/**
 * Client Master Files, page one — the projects.
 *
 * note.txt: "Client Master files: Naka per project siya, for example legaspi
 * place nandun yung search button… Pages 1 /clients — puro project lang muna
 * ito."
 *
 * ── Why this replaced a single flat list ──────────────────────────────────
 *
 * The screen used to be every approved buyer in the company, one after
 * another. That reads fine at two buyers and stops working at two hundred:
 * staff work a project at a time, and the question they arrive with is "who
 * bought in Emerald Park", not "who has bought anything".
 *
 * A master file still means what it meant — a buyer with an APPROVED
 * reservation. The statuses come from `SALES_VISIBLE_STATUSES`, the same list
 * the Sales screen and the Security Rules use, rather than a second copy that
 * could drift.
 *
 * Projects that have sold nothing are shown, reading "no buyers yet". Hiding
 * them would leave the reader unable to tell that from "not in the system".
 */
export default async function ClientMasterFileProjectsPage() {
  await requireModule('CLIENT_PROFILE');

  const projects = await listMasterfileProjects(getAdminFirestore(), SALES_VISIBLE_STATUSES);
  const totalSold = projects.reduce((n, p) => n + p.unitsSold, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">Client Master Files</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Choose a project to search its buyers. A master file exists for a buyer with an approved
          reservation, from the Portal or from the walk-in counter — a registered account with
          nothing approved does not appear.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Projects
          </h2>
          <span className="text-[11px] font-medium text-neutral-500">
            {totalSold} {totalSold === 1 ? 'unit' : 'units'} sold in total
          </span>
        </header>

        <ul className="divide-y divide-neutral-100">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/clients/${project.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                  <Building2 className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-800">
                    {project.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {project.location || '—'}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {project.unitsSold === 0 ? (
                    <span className="text-xs text-neutral-400">no buyers yet</span>
                  ) : (
                    <>
                      <span className="tabular block text-sm font-semibold text-navy-700">
                        {project.unitsSold} sold
                      </span>
                      <span className="mt-0.5 block text-[11px] text-neutral-500">
                        {project.buyers} {project.buyers === 1 ? 'buyer' : 'buyers'}
                      </span>
                    </>
                  )}
                </span>

                <ChevronRight
                  className="h-4 w-4 shrink-0 text-neutral-300"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
