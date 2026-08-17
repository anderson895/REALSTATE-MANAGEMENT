import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { UNIT_TYPES, can, canManageMedia, canRemoveInventory } from '@sfsr/domain';
import {
  getAdminFirestore,
  listProjects,
  listUnits,
  type ProjectSummary,
} from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { requireModule, toActor } from '@/lib/session';
import { AddProjectDialog } from './add-project-dialog';
import { AddUnitDialog } from './add-unit-dialog';
import { UnitTable } from './unit-table';

/**
 * Unit Inventory — the catalogue, and the only place to add to it.
 *
 * ── Two roles, two very different screens, one route ─────────────────────
 *
 * RBAC.xls gives Sales and Account Receivables this module as view-and-print:
 * an agent looks up what is still available before quoting a buyer. Marketing
 * now holds it with `create` and `modify` as well — a client instruction,
 * "dapat nakakapag add din ang marketing ng mga project at unit" — because
 * until now new stock could only arrive through `npm run seed:load` out of
 * `DATABASE PROJECT.xls`.
 *
 * The two buttons are drawn from the `create` grant rather than from the role,
 * so the page does not have to know who Marketing is. `requireModule` lets all
 * three in; the actions behind the buttons refuse anyone without the grant,
 * which is the control (§3.3).
 *
 * ── Why the counts come off the project and not the units ────────────────
 *
 * `stats` is denormalised onto each project document. Counting 150 units to
 * render five headline figures costs 150 reads a view against a 50,000/day
 * quota; reading the pre-computed answer costs 5 (§12.30). Adding a unit
 * recomputes the affected project, so these stay true without a scan.
 */
export default async function UnitInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await requireModule('UNIT_INVENTORY');
  const actor = toActor(session);
  const canAdd = can(actor, 'UNIT_INVENTORY', 'create');
  // Narrower than `canAdd` on purpose — see canManageMedia in the domain.
  const canEditMedia = canManageMedia(actor);
  const canRemove = canRemoveInventory(actor);

  const db = getAdminFirestore();
  // COST: 6 reads. The counts are already on the documents.
  const projects = await listProjects(db);

  const { project: requested } = await searchParams;
  const selected = projects.find((p) => p.id === requested) ?? projects[0] ?? null;

  /*
   * COST: up to 200, bounded by MAX_UNITS_PER_QUERY. Only the chosen project.
   *
   * ── Why this is not run in parallel with the projects query ──────────────
   *
   * It was, briefly. `?project=` is in the URL before either query starts, so
   * the units never truly needed the project list, and running both at once
   * looked like a free saving on a page that takes ~1.5s to switch tabs.
   *
   * Measured, it saved nothing: sequential 1127ms, parallel 1131ms. The
   * Firestore Admin SDK multiplexes over one gRPC channel and these do not
   * overlap.
   *
   * Nor is the row count the cost. `scripts/measure-inventory-render.ts` times
   * the whole render, and on one run `limit: 1` took 819ms while the unlimited
   * query took 874ms — a document is nearly free, a round trip is not. That is
   * also why the table paginates in the browser rather than here: fetching a
   * page at a time would add round trips to save something that does not cost
   * anything.
   *
   * The three round trips a tab switch actually makes are
   * verifySessionCookie(checkRevoked) at ~290ms, listProjects at ~563ms and
   * this at ~800ms. So the sequential form stays, being the simpler one, and
   * making this page faster means not making the round trip at all — caching,
   * as the Portal does — which is a freshness decision, not a plumbing one.
   */
  const units = selected ? await listUnits(db, selected.id) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-navy-700"
              >
                <Building2 className="h-4 w-4" strokeWidth={2} />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-navy-800">Unit Inventory</h1>
            </div>
            <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
          </div>

          {canAdd ? (
            <div className="flex items-center gap-2">
              <AddProjectDialog />
              <AddUnitDialog projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
          ) : null}
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          {canAdd
            ? 'Every project and unit on sale. Adding a unit gives it the next ID in its project’s series and puts it on the market as Available.'
            : 'Every project and unit on sale, with live status. This is a read-only view — stock changes through the reservation workflow.'}
        </p>
      </header>

      {projects.length === 0 ? (
        <section className="rounded-xl border border-neutral-200/80 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-medium text-navy-800">No projects yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
            {canAdd
              ? 'Add a project first — units are added to one.'
              : 'Run npm run seed:load to load the catalogue from DATABASE PROJECT.xls.'}
          </p>
        </section>
      ) : (
        <>
          <nav aria-label="Projects" className="mb-6 flex flex-wrap gap-2">
            {projects.map((project) => (
              <ProjectTab
                key={project.id}
                project={project}
                current={project.id === selected?.id}
              />
            ))}
          </nav>

          {selected ? (
            /*
             * Keyed by project so the search box and the page number reset
             * when the tab changes. Without it React keeps the state across
             * the navigation and you arrive at Skyline Quarter still filtered
             * by whatever you typed on Emerald Park, looking at an empty table.
             */
            <UnitTable
              key={selected.id}
              project={selected}
              units={units}
              unitTypes={UNIT_TYPES}
              canEditMedia={canEditMedia}
              canRemove={canRemove}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * One project, as a tab carrying its own availability.
 *
 * A plain `<Link>` rather than a client-side filter: which project you are
 * looking at is a place, so it belongs in the URL where it can be reloaded and
 * sent to someone — the same argument the queue pager makes.
 */
function ProjectTab({ project, current }: { project: ProjectSummary; current: boolean }) {
  return (
    <Link
      href={{ pathname: '/inventory', search: `project=${encodeURIComponent(project.id)}` }}
      scroll={false}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'rounded-lg border px-3.5 py-2 text-left transition-colors',
        current
          ? 'border-navy-800 bg-navy-800 text-white'
          : 'border-neutral-200 bg-white text-neutral-700 hover:border-navy-300',
      )}
    >
      <span className="block text-sm font-semibold">{project.name}</span>
      <span
        className={cn('mt-0.5 block text-[11px]', current ? 'text-white/70' : 'text-neutral-500')}
      >
        {project.id} · {project.stats.availableUnits} of {project.stats.totalUnits} available
      </span>
    </Link>
  );
}
