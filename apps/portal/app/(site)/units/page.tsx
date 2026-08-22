import Link from 'next/link';
import type { Metadata } from 'next';
import { Money, listedUnitTypes } from '@sfsr/domain';
import type { UnitRow } from '@sfsr/infrastructure/server';
import { EmptyState } from '@sfsr/ui';
import { filterUnits, getCachedProjects, getListedUnits } from '@/lib/catalog';
import { formatRange, formatShort } from '@/lib/format';
import { UnitSearchBar } from './unit-search-bar';

export const metadata: Metadata = { title: 'Available Units' };

/**
 * Cross-project unit search — where the landing page's search bar lands.
 *
 * ── Why this is not a flat list of 150 rows ───────────────────────────────
 *
 * It was, and the problem was not its length but its REPETITION: four Studios
 * on the same floor sit next to each other identical in every column but the
 * unit number. Nobody chooses between those, so the list was long without
 * being informative, and paginating it would only have produced eight pages of
 * the same non-choice.
 *
 * So browsing is layered instead, mirroring how the inventory is actually
 * shaped: one card per unit type per project (~25 cards, each a genuinely
 * different thing), opening into the units of that type.
 *
 * Opening a card is just `?project=X&type=Y` — the drill-in IS a filter. That
 * keeps one code path for both views, makes every state shareable as a link,
 * and needs no client JavaScript.
 *
 * A price filter falls back to the flat list: there is no sensible type card
 * for "everything under ₱7M", which cuts across every type at once.
 *
 * ── Cost ──
 *
 * Reads the SAME cache entries the project pages do — one per project, holding
 * every unit in it. No filter appears in a cache key, so no combination of
 * project, type or price can add a Firestore read the project pages have not
 * already paid for. Cold that is 5 × 30 = 150 documents; warm it is zero, and
 * the grouping below is pure in-memory work.
 */

/** Rows revealed per "Show more" press, matching the reference design. */
const PAGE_SIZE = 50;

interface TypeGroup {
  readonly key: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly location: string;
  readonly unitType: string;
  readonly count: number;
  readonly minArea: number;
  readonly maxArea: number;
  readonly minPrice: number;
  readonly maxPrice: number;
}

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const projectId = first(query.project);
  const unitType = first(query.type);
  const rawMin = first(query.min);
  const rawMax = first(query.max);

  // Pesos in the URL — that is what the buyer typed — centavos internally.
  const toCentavos = (raw: string | undefined): number | null => {
    const n = Number(raw);
    return raw && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };
  const min = toCentavos(rawMin);
  const max = toCentavos(rawMax);

  const projects = await getCachedProjects();
  const searched = projectId ? projects.filter((p) => p.id === projectId) : projects;

  /*
   * `getListedUnits` already drops everything a buyer may not see — anything
   * not Available, and any withheld type. The explicit `status: 'Available'`
   * that used to be in the filter below has gone with it, so there is one
   * place that decides this rather than two that could disagree.
   */
  const perProject = await Promise.all(searched.map((p) => getListedUnits(p.id)));

  const units = filterUnits(perProject.flat(), {
    unitType,
    minCentavos: min,
    maxCentavos: max,
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const unitTypes = listedUnitTypes(
    [...new Set(projects.flatMap((p) => p.stats.unitTypes))].sort(),
  );

  // A price filter cuts across types, and picking a type inside a project means
  // the buyer has already opened that card — both want the actual units.
  const showFlatList = min !== null || max !== null || Boolean(projectId && unitType);

  /*
   * Has the buyer actually asked for anything yet?
   *
   * comments.doc, on this tab: "ito nalang ang ididisplay muna" — the heading,
   * the total, and the search bar. Nothing is listed until something is typed.
   *
   * The same instruction the Client Master Files screen already carries, and
   * the same reasoning: this is a catalogue of 137 units, and opening it with
   * twenty-five cards is the "overwhelming sa mata" that removing the pictures
   * was only half a fix for. A file room does not lay every folder on the table
   * when you walk in.
   *
   * The units are all fetched regardless — they have to be, to count them, and
   * they come from a cache the project pages have already paid for. Withholding
   * them is a decision about the screen, not about what it costs.
   */
  const searching = Boolean(projectId ?? unitType) || min !== null || max !== null;

  const searchBar = (
    <UnitSearchBar
      projects={projects}
      unitTypes={unitTypes}
      current={{ project: projectId, type: unitType, min: rawMin, max: rawMax }}
    />
  );

  if (!searching) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Header count={units.length} />
        {searchBar}

        <div className="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium text-neutral-800">
            Search to see what is available
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-neutral-500">
            Choose a project or a unit type above, or set a price range. You can also browse by
            building from{' '}
            <Link href="/projects" className="font-medium text-brand-600 hover:underline">
              Condominium Projects
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Header count={0} projectName={projectId ? projectById.get(projectId)?.name : undefined} />
        {searchBar}
        {/*
         * "Clear" no longer means "show me everything" — it returns to the
         * search prompt. The label says so rather than promising a list the
         * page will not draw.
         */}
        <EmptyState
          title="No units match your search"
          description="Try widening the price range, or clearing the unit type and searching again."
          actionHref="/units"
          actionLabel="Start a new search"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Header
        count={units.length}
        projectName={projectId ? projectById.get(projectId)?.name : undefined}
        unitType={unitType}
        grouped={!showFlatList}
      />
      {searchBar}

      {showFlatList ? (
        <FlatList units={units} projectById={projectById} shown={Number(first(query.show)) || PAGE_SIZE} query={query} />
      ) : (
        <TypeCards groups={groupByType(units, projectById)} />
      )}
    </div>
  );
}

/* ── grouping ─────────────────────────────────────────────────────────── */

function groupByType(
  units: readonly UnitRow[],
  projectById: ReadonlyMap<string, { name: string; location: string; floorPlans: Readonly<Record<string, string>> }>,
): TypeGroup[] {
  const acc = new Map<string, { units: UnitRow[]; projectId: string; unitType: string }>();

  for (const unit of units) {
    const key = `${unit.projectId}|${unit.unitType}`;
    const existing = acc.get(key);
    if (existing) existing.units.push(unit);
    else acc.set(key, { units: [unit], projectId: unit.projectId, unitType: unit.unitType });
  }

  return [...acc.values()]
    .map(({ units: group, projectId, unitType }): TypeGroup => {
      const project = projectById.get(projectId);
      const areas = group.map((u) => u.areaSqm);
      const prices = group.map((u) => u.purchasePriceCentavos);

      return {
        key: `${projectId}|${unitType}`,
        projectId,
        projectName: project?.name ?? projectId,
        location: project?.location ?? '',
        unitType,
        count: group.length,
        minArea: Math.min(...areas),
        maxArea: Math.max(...areas),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
      };
    })
    .sort((a, b) =>
      a.projectName.localeCompare(b.projectName) || a.minPrice - b.minPrice,
    );
}

/* ── views ────────────────────────────────────────────────────────────── */

function Header({
  count,
  projectName,
  unitType,
  grouped,
}: {
  count: number;
  projectName?: string;
  unitType?: string;
  grouped?: boolean;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold">Available Units</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {count} {count === 1 ? 'unit' : 'units'}
        {projectName ? ` in ${projectName}` : ' across all projects'}
        {unitType ? ` · ${unitType}` : ''}
        {grouped ? ' · grouped by unit type' : ''}
      </p>
    </header>
  );
}

/**
 * One card per unit type per project — now without the picture.
 *
 * comments.doc: "Padelete nalang po nung mga picture nung floor plan pag
 * i-click ung Available units tab. Wala po dapat mga picture. Search bar na
 * lang po para d overwhelming sa mata."
 *
 * ── What the images were doing, and why losing them is fine ──────────────
 *
 * They were the floor plan for the type, chosen because it is the only picture
 * in the inventory that differs between these cards — the building render is
 * identical for every type in a project. But at 600px wide a floor plan is a
 * grey tangle of lines: it filled three quarters of each card and told a buyer
 * nothing they could act on, and twenty-five of them at once is exactly the
 * "overwhelming sa mata" being complained about. The plans are still one click
 * away, full size, on the project page and on each unit.
 *
 * What is left is what a buyer actually chooses between: type, project, size,
 * price, how many are left. Denser rows fit more of that on one screen, which
 * is the real answer to a page that was hard to scan.
 */
function TypeCards({ groups }: { groups: readonly TypeGroup[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <Link
          key={g.key}
          href={`/units?project=${encodeURIComponent(g.projectId)}&type=${encodeURIComponent(g.unitType)}`}
          className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold group-hover:text-brand-700">{g.unitType}</h2>
              <p className="mt-0.5 truncate text-xs text-neutral-500">{g.projectName}</p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
              {g.count} available
            </span>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            {g.location ? `${g.location} · ` : ''}
            {g.minArea === g.maxArea ? `${g.minArea} sqm` : `${g.minArea}–${g.maxArea} sqm`}
          </p>

          <p className="tabular mt-2 text-sm font-bold text-brand-600">
            {formatRange(g.minPrice, g.maxPrice)}
          </p>

          <span className="mt-3 border-t border-neutral-100 pt-2.5 text-xs font-semibold text-neutral-400 group-hover:text-brand-600">
            See the units &rarr;
          </span>
        </Link>
      ))}
    </div>
  );
}

function FlatList({
  units,
  projectById,
  shown,
  query,
}: {
  units: readonly UnitRow[];
  projectById: ReadonlyMap<string, { name: string }>;
  shown: number;
  query: Record<string, string | string[] | undefined>;
}) {
  const sorted = [...units].sort((a, b) => a.purchasePriceCentavos - b.purchasePriceCentavos);
  const visible = sorted.slice(0, shown);

  // "Show more" is a link, not a button: it keeps this a Server Component, and
  // the widened view stays shareable and survives a refresh.
  const moreHref = () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k !== 'show' && typeof v === 'string' && v) params.set(k, v);
    }
    params.set('show', String(shown + PAGE_SIZE));
    return `/units?${params.toString()}`;
  };

  return (
    <>
      {/*
       * Two renderings of the same rows: cards below `sm`, the table above.
       *
       * A six-column table cannot be read on a 327px screen. Letting it scroll
       * sideways is barely better — a buyer comparing prices would be dragging
       * the price column in and out of view. The wrapper here used to be
       * `overflow-hidden`, which did not even scroll: it simply CUT the last
       * columns off.
       *
       * `hidden` is display:none, so the copy that is not showing leaves the
       * accessibility tree too and a screen reader hears the rows once.
       */}
      <ul className="space-y-3 sm:hidden">
        {visible.map((unit) => (
          <li key={unit.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {unit.unitNo}
                  {unit.tower ? (
                    <span className="ml-1.5 text-xs font-normal text-neutral-500">{unit.tower}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {projectById.get(unit.projectId)?.name ?? unit.projectId}
                </p>
              </div>
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              {unit.unitType} · {unit.areaSqm} sqm
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="tabular text-sm font-semibold">
                {Money.fromCentavos(unit.purchasePriceCentavos).format()}
              </p>
              <Link
                href={`/units/${unit.id}`}
                className="shrink-0 text-xs font-semibold text-brand-600 hover:text-accent-500"
              >
                View &rarr;
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border border-neutral-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr className="text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-4 py-2.5 font-semibold">Unit</th>
              <th className="px-4 py-2.5 font-semibold">Project</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 text-right font-semibold">Area</th>
              <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((unit) => (
              <tr key={unit.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium">
                  {unit.unitNo}
                  {unit.tower ? (
                    <span className="ml-1.5 text-xs text-neutral-500">{unit.tower}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {projectById.get(unit.projectId)?.name ?? unit.projectId}
                </td>
                <td className="px-4 py-3 text-neutral-600">{unit.unitType}</td>
                <td className="tabular px-4 py-3 text-right text-neutral-600">{unit.areaSqm} sqm</td>
                <td className="tabular px-4 py-3 text-right font-semibold">
                  {Money.fromCentavos(unit.purchasePriceCentavos).format()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/units/${unit.id}`}
                    className="text-xs font-semibold text-brand-600 hover:text-accent-500"
                  >
                    View &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > visible.length ? (
        <div className="mt-6 text-center">
          <p className="mb-2 text-sm text-neutral-500">
            Showing {visible.length} of {sorted.length} · from {formatShort(sorted[0]!.purchasePriceCentavos)}
          </p>
          <Link
            href={moreHref()}
            className="inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Show more units
          </Link>
        </div>
      ) : null}
    </>
  );
}
