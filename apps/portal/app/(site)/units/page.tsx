import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Money } from '@sfsr/domain';
import type { UnitRow } from '@sfsr/infrastructure/server';
import { EmptyState, StatusBadge, cloudinaryUrl } from '@sfsr/ui';
import { filterUnits, getCachedProjects, getCachedUnits } from '@/lib/catalog';
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
  readonly floorPlanUrl: string | null;
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
  const perProject = await Promise.all(searched.map((p) => getCachedUnits(p.id)));

  // Only genuinely available units: one someone else is already processing
  // should not be advertised as an option.
  const units = filterUnits(perProject.flat(), {
    status: 'Available',
    unitType,
    minCentavos: min,
    maxCentavos: max,
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const unitTypes = [...new Set(projects.flatMap((p) => p.stats.unitTypes))].sort();

  // A price filter cuts across types, and picking a type inside a project means
  // the buyer has already opened that card — both want the actual units.
  const showFlatList = min !== null || max !== null || Boolean(projectId && unitType);

  const searchBar = (
    <UnitSearchBar
      projects={projects}
      unitTypes={unitTypes}
      current={{ project: projectId, type: unitType, min: rawMin, max: rawMax }}
    />
  );

  if (units.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Header count={0} projectName={projectId ? projectById.get(projectId)?.name : undefined} />
        {searchBar}
        <EmptyState
          title="No units match your search"
          description="Try widening the price range, or clearing the unit type to see everything that is available."
          actionHref="/units"
          actionLabel="See all available units"
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
        // The floor plan is the only picture in the inventory that actually
        // DIFFERS between these cards — the building render is identical for
        // every type in a project, so it could not tell them apart.
        floorPlanUrl: project?.floorPlans[unitType] ?? null,
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

function TypeCards({ groups }: { groups: readonly TypeGroup[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <Link
          key={g.key}
          href={`/units?project=${encodeURIComponent(g.projectId)}&type=${encodeURIComponent(g.unitType)}`}
          className="group overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg"
        >
          <div className="relative aspect-[4/3] bg-neutral-50">
            {g.floorPlanUrl ? (
              <Image
                src={cloudinaryUrl(g.floorPlanUrl, { width: 600, height: 450, crop: 'fit' })}
                alt={`${g.unitType} floor plan`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-contain p-2"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                Floor plan coming soon
              </div>
            )}
            <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              {g.count} available
            </span>
          </div>

          <div className="border-t border-neutral-100 p-4">
            <h2 className="font-semibold group-hover:text-brand-700">{g.unitType}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{g.projectName}</p>
            <p className="mt-2 text-xs text-neutral-500">
              {g.minArea === g.maxArea ? `${g.minArea} sqm` : `${g.minArea}–${g.maxArea} sqm`}
            </p>
            <p className="tabular mt-1 text-sm font-bold text-brand-600">
              {formatRange(g.minPrice, g.maxPrice)}
            </p>
          </div>
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
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
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
                  <span className="mr-3 align-middle">
                    <StatusBadge status={unit.status} />
                  </span>
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
