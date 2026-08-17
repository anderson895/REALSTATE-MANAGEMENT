'use client';

import { useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Money } from '@sfsr/domain';
import type { ProjectSummary, UnitRow } from '@sfsr/infrastructure/server';
import { StatusBadge, cn } from '@sfsr/ui';
import { DeleteProjectButton } from './delete-project-button';
import { DeleteUnitButton } from './delete-unit-button';
import { ManageMediaDialog, type MediaTarget } from './manage-media-dialog';

/**
 * The unit table, with a search box and a pager over it.
 *
 * ── What this does and does not fix ──────────────────────────────────────
 *
 * It was asked for to make switching projects faster, on the theory that the
 * page fetches too much at once. It does not do that, and the theory is wrong —
 * worth recording here so the next person does not spend the afternoon
 * paginating the query instead.
 *
 * `scripts/measure-inventory-render.ts` times each step against the live
 * database. On one run: `limit: 1` took 819ms, `limit: 15` took 361ms, and the
 * unlimited query — all thirty units — took 874ms. The row count does not
 * order those. What a tab switch actually costs is three network round trips
 * that happen whatever the limit is:
 *
 *     verifySessionCookie(checkRevoked)   ~290ms
 *     listProjects()                      ~563ms
 *     listUnits()                         ~800ms
 *
 * A document does not cost time; a round trip does. Fetching fifteen rows
 * instead of thirty saves a few bytes on the wire and nothing that anyone can
 * feel. Making this page faster means not making the round trip — caching, as
 * the Portal does — which is a freshness decision and a separate one.
 *
 * ── So why have them at all ──────────────────────────────────────────────
 *
 * Because thirty rows is today. Skyline Quarter is a forty-floor twin tower and
 * the seeded thirty are a sample of it; when the real inventory is loaded, a
 * project holds hundreds and a page that renders all of them is a page nobody
 * can find a unit on. The search is the part that earns its place immediately —
 * "A-704" beats scrolling even at thirty.
 *
 * ── Why the state is not in the URL ──────────────────────────────────────
 *
 * The project tab is a `<Link>`, because which project you are looking at is a
 * place worth reloading and sending to someone. The search term and the page
 * number are not: putting either in the URL would make every keystroke and
 * every Next a server round trip, and the round trip is the thing that is
 * already slow. Held in memory, both are instant — the rows are all here
 * anyway, so filtering costs nothing, and Firestore could not do a substring
 * match if we asked it to.
 */

/**
 * Rows per page.
 *
 * Fifteen fills a laptop screen without scrolling the header away. Not a
 * setting, because a per-user page size is a preference to store, a control to
 * draw and a thing to explain, and no one has asked to see a different number.
 */
const PAGE_SIZE = 15;

/**
 * Every picture a PROJECT owns, as slots the dialog can fill.
 *
 * Floor plans are offered for all five unit types rather than only the ones
 * this project currently sells, so a plan can be put in place before the units
 * that use it are added — which is the order things actually happen in, and
 * the reason Penthouse has no plan in any project today.
 */
function projectMediaTargets(project: ProjectSummary, unitTypes: readonly string[]): MediaTarget[] {
  return [
    {
      slot: 'hero',
      label: 'Project render',
      hint: 'The main image on the project page.',
      url: project.heroImageUrl,
    },
    {
      slot: 'amenities',
      label: 'Amenities sheet',
      hint: 'The amenities and facilities poster.',
      url: project.amenitiesImageUrl,
    },
    ...unitTypes.map(
      (unitType): MediaTarget => ({
        slot: 'floorPlan',
        label: `${unitType} floor plan`,
        hint: 'Shown on every unit of this type.',
        url: project.floorPlans[unitType] ?? null,
        unitType,
      }),
    ),
  ];
}

export function UnitTable({
  project,
  units,
  unitTypes,
  canEditMedia,
  canRemove,
}: {
  project: ProjectSummary;
  units: readonly UnitRow[];
  /** UNIT_TYPES, passed in so the slot list stays the domain's to decide. */
  unitTypes: readonly string[];
  canEditMedia: boolean;
  canRemove: boolean;
}) {
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(0);

  /*
   * Offered only on a project holding nothing.
   *
   * The action re-counts units, parking and reservations and refuses anyway —
   * that is the control. This keeps a button labelled "Remove" from sitting
   * beside 30 sold units looking like it would take them too.
   */
  const removable =
    canRemove && project.stats.totalUnits === 0 && project.stats.totalParking === 0;

  /*
   * Unit number first, because that is what is written on the plan and on
   * whatever printout the person is holding. Everything else on the row is
   * matched too — type and status make the box double as a filter, so "sold"
   * or "studio" narrows the table without needing a separate control.
   */
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (q === '') return units;
    return units.filter((u) =>
      [u.unitNo, u.id, u.unitType, u.status, u.tower ?? '', `floor ${u.floor}`].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [units, term]);

  // Clamped rather than reset in an effect: typing can shorten the list under
  // a page that no longer exists, and a table that renders empty while the
  // pager reads "Page 3 of 1" looks broken.
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);

  const searching = term.trim() !== '';

  function search(next: string) {
    setTerm(next);
    setPage(0);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            {project.name}
          </h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {project.buildingType} · {project.location} · {project.floors} floors
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-neutral-500">
            {project.stats.availableUnits} available · {project.stats.onHoldUnits} on hold ·{' '}
            {project.stats.soldUnits} sold
          </span>
          {canEditMedia ? (
            <ManageMediaDialog
              projectId={project.id}
              projectName={project.name}
              targets={projectMediaTargets(project, unitTypes)}
            />
          ) : null}
          {removable ? (
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          ) : null}
        </div>
      </header>

      {units.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-navy-800">No units in this project yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
            Use “Add unit” above. The first one becomes {project.code}&rsquo;s 001.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200/80 px-5 py-3">
            <div className="relative min-w-[15rem] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => search(event.target.value)}
                placeholder="Search unit number, type or status"
                aria-label="Search units in this project"
                className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
              />
            </div>
            <span aria-live="polite" className="text-[11px] font-medium text-neutral-500">
              {searching
                ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} of ${units.length}`
                : `${units.length} ${units.length === 1 ? 'unit' : 'units'}`}
            </span>
          </div>

          {matches.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-navy-800">Nothing matches that search</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
                Try the unit number as it appears on the plan, or a unit type such as
                “Studio”.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Unit ID</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Unit No.</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Tower / Floor</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Type</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold">Area</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold">Price</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Status</th>
                    {canEditMedia ? (
                      <th scope="col" className="px-5 py-2.5 font-semibold">
                        Photo
                      </th>
                    ) : null}
                    {canRemove ? (
                      <th scope="col" className="px-5 py-2.5 font-semibold">
                        <span className="sr-only">Remove unit</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visible.map((unit) => (
                    <tr key={unit.id} className="transition-colors hover:bg-navy-50/60">
                      <td className="tabular px-5 py-3 font-semibold text-navy-700">{unit.id}</td>
                      <td className="px-5 py-3 text-neutral-700">{unit.unitNo}</td>
                      <td className="px-5 py-3 text-neutral-500">
                        {[unit.tower, `Floor ${unit.floor}`].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-5 py-3 text-neutral-700">{unit.unitType}</td>
                      <td className="tabular px-5 py-3 text-right text-neutral-700">
                        {unit.areaSqm} sqm
                      </td>
                      <td className="tabular px-5 py-3 text-right font-medium text-neutral-800">
                        {Money.fromCentavos(unit.purchasePriceCentavos).format()}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={unit.status} />
                      </td>
                      {/*
                       * A photograph of THIS room, distinct from the floor plan,
                       * which is shared by every unit of the same type. Most units
                       * will never have one — these are pre-selling towers — so the
                       * cell reads "Add" rather than presenting an empty frame.
                       */}
                      {canEditMedia ? (
                        <td className="px-5 py-3">
                          <ManageMediaDialog
                            projectId={project.id}
                            projectName={`${project.name} · ${unit.unitNo}`}
                            targets={[
                              {
                                slot: 'unitPhoto',
                                label: `Photo of ${unit.unitNo}`,
                                hint: 'This specific unit, not the floor plan.',
                                url: unit.photoUrl,
                                unitId: unit.id,
                              },
                            ]}
                            trigger={
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                                  unit.photoUrl
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-navy-300 hover:text-navy-700',
                                )}
                              >
                                <Camera className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                                {unit.photoUrl ? 'Change' : 'Add'}
                              </button>
                            }
                          />
                        </td>
                      ) : null}
                      {/*
                       * Drawn on every row, muted on the ones that cannot go.
                       *
                       * It used to be omitted entirely on anything not Available,
                       * which left a gap in the column — and a gap reads as
                       * something that failed to render rather than something
                       * deliberately withheld. Muted-and-explains-itself keeps the
                       * grid intact without offering to undo a sale.
                       */}
                      {canRemove ? (
                        <td className="px-5 py-3">
                          <DeleteUnitButton
                            unitId={unit.id}
                            unitNo={unit.unitNo}
                            blockedReason={
                              unit.status === 'Available'
                                ? undefined
                                : `${unit.unitNo} is ${unit.status}. A unit that has been taken off the market stays on the record — that is what On Hold and Sold are for, and a reservation, payment or document may refer to it.`
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageCount > 1 ? (
            <nav
              aria-label="Unit pages"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/80 px-5 py-3"
            >
              <span className="tabular text-[11px] text-neutral-500">
                Showing {start + 1}–{start + visible.length} of {matches.length}
              </span>
              <div className="flex items-center gap-2">
                <PagerButton
                  onClick={() => setPage(current - 1)}
                  disabled={current === 0}
                  label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Previous
                </PagerButton>
                <span className="tabular px-1 text-[11px] font-medium text-neutral-600">
                  Page {current + 1} of {pageCount}
                </span>
                <PagerButton
                  onClick={() => setPage(current + 1)}
                  disabled={current >= pageCount - 1}
                  label="Next page"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </PagerButton>
              </div>
            </nav>
          ) : null}
        </>
      )}

      <p className="border-t border-neutral-200/80 px-5 py-3 text-[11px] leading-relaxed text-neutral-500">
        Status is not edited here. A unit becomes On Hold when Billing verifies a reservation fee
        and Sold when a supervisor approves — the reservation workflow owns it, so a unit can never
        read Sold with nothing behind it.
      </p>
    </section>
  );
}

/** Genuinely `disabled` — unlike Remove, there is nothing to explain at the ends. */
function PagerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
        disabled
          ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-300'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-navy-300 hover:text-navy-700',
      )}
    >
      {children}
    </button>
  );
}
