import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money } from '@sfsr/domain';
import type { UnitRow } from '@sfsr/infrastructure/server';
import { StatusBadge, cloudinaryUrl } from '@sfsr/ui';
import { filterUnits, getCachedProject, getCachedUnits } from '@/lib/catalog';
import { formatRange } from '@/lib/format';
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

  // Types this project actually sells, paired with the client's copy for them.
  //
  // Driven by `stats.unitTypes` rather than by the copy's own keys, so a type
  // the client wrote a blurb for but stopped selling does not reappear here as
  // an advertisement for something unbuyable. The fallback matters for The
  // Legaspi Place, which has copy and amenities but no seeded inventory yet —
  // without it that project would show no unit types at all.
  const sellingTypes =
    project.stats.unitTypes.length > 0
      ? project.stats.unitTypes
      : Object.keys(project.unitTypeDescriptions);

  const unitTypesWithCopy = sellingTypes
    .map((unitType) => [unitType, project.unitTypeDescriptions[unitType]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));

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
          {project.buildings ? <Detail label="Buildings" value={project.buildings} /> : null}
          <Detail label="Developer" value={project.developer || '—'} />
          <Detail
            label="Availability"
            value={`${project.stats.availableUnits} of ${project.stats.totalUnits} units`}
          />
        </dl>
      </header>

      {/*
       * Everything from here to the floor plans is the client's marketing copy,
       * and EVERY section of it is conditional.
       *
       * That is not defensive habit — the source document genuinely does not
       * cover all five projects equally. Emerald Park has fifteen amenities and
       * no description at all; The Legaspi Place has no floor plans. Rendering
       * an "About this project" heading above nothing is worse than omitting
       * the section, so each one asks whether it has content first.
       *
       * Order follows the layout sketched at the end of the client's document:
       * about, unit types, amenities, then floor plans.
       */}
      {project.description.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">About this project</h2>
          <div className="space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {project.description.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}

      {unitTypesWithCopy.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Unit types available</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {unitTypesWithCopy.map(([unitType, copy]) => (
              <div
                key={unitType}
                className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <h3 className="text-sm font-semibold">{unitType}</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {project.amenities.length > 0 || project.amenitiesImageUrl ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Amenities &amp; facilities</h2>

          {project.amenities.length > 0 ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-600 sm:grid-cols-3 dark:text-neutral-400">
              {project.amenities.map((amenity) => (
                <li key={amenity} className="flex items-start gap-1.5">
                  <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />
                  {amenity}
                </li>
              ))}
            </ul>
          ) : null}

          {/*
           * The poster carries its own labels as pixels, so it is the decorative
           * half of this section and the list above is the readable one. It is
           * announced as a link to the full-size image rather than given a
           * transcript in `alt`: the list IS the transcript, and it is already
           * on the page.
           */}
          {project.amenitiesImageUrl ? (
            <a
              href={cloudinaryUrl(project.amenitiesImageUrl, { width: 1536 })}
              target="_blank"
              rel="noreferrer"
              className="group mt-4 block overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="relative aspect-[3/2] bg-neutral-50 dark:bg-neutral-800">
                <Image
                  src={cloudinaryUrl(project.amenitiesImageUrl, { width: 1024 })}
                  alt={`${project.name} amenities and facilities overview`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 1024px"
                  className="object-contain"
                />
              </div>
              <p className="border-t border-neutral-100 px-3 py-1.5 text-center text-xs text-neutral-500 group-hover:text-brand-700 dark:border-neutral-800">
                Open the full amenities sheet →
              </p>
            </a>
          ) : null}
        </section>
      ) : null}

      {project.locationHighlights.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Nearby &amp; accessible</h2>
          <ul className="flex flex-wrap gap-1.5">
            {project.locationHighlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"
              >
                {highlight}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      {units.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          No units match these filters.
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {groupByFloor(units).map(([floor, rows], index) => (
            <FloorGroup
              key={floor}
              floor={floor}
              rows={rows}
              hasTower={hasTower}
              // The first floor always opens, so the page never lands as a
              // stack of shut drawers with nothing to read. Everything opens
              // when the set is already small — once a filter has cut it to a
              // handful, hiding them again is work for no gain.
              open={index === 0 || units.length <= 8}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        {units.length} unit{units.length === 1 ? '' : 's'}
        {filtered ? ' matching your filters' : ''}. Availability updates as reservations are
        verified by the St. Francis Square Realty team.
      </p>
    </div>
  );
}

/** Units bucketed by floor, low to high. */
function groupByFloor(units: readonly UnitRow[]): [number, UnitRow[]][] {
  const byFloor = new Map<number, UnitRow[]>();
  for (const unit of units) {
    const rows = byFloor.get(unit.floor);
    if (rows) rows.push(unit);
    else byFloor.set(unit.floor, [unit]);
  }
  return [...byFloor.entries()].sort(([a], [b]) => a - b);
}

/**
 * One collapsible floor.
 *
 * Native `<details>`, not a click handler: the browser already knows how to
 * open and close one, announce it to a screen reader, and drive it from the
 * keyboard. Reaching for state here would mean marking the whole page
 * `'use client'` and shipping JavaScript to reimplement a browser feature.
 *
 * The summary carries the count and the price range, so the choice to open a
 * floor can be made without opening it — which is the entire point of
 * collapsing them.
 *
 * Each floor gets its OWN table, complete with its own header. That is not a
 * compromise forced by `<details>` (which cannot wrap a `<tbody>`): opening
 * floor 6 puts the column labels right there, rather than back up the page
 * past five collapsed sections. `table-fixed` with matching widths keeps the
 * columns aligned from one floor to the next.
 */
function FloorGroup({
  floor,
  rows,
  hasTower,
  open,
}: {
  floor: number;
  rows: readonly UnitRow[];
  hasTower: boolean;
  open: boolean;
}) {
  const prices = rows.map((r) => r.purchasePriceCentavos);
  const types = [...new Set(rows.map((r) => r.unitType))];
  const available = rows.filter((r) => r.status === 'Available').length;

  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 [&::-webkit-details-marker]:hidden dark:hover:bg-neutral-800/50">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>

        <span className="text-sm font-semibold">Floor {floor}</span>

        <span className="text-xs text-neutral-500">
          {rows.length} {rows.length === 1 ? 'unit' : 'units'}
          {available < rows.length ? ` · ${available} available` : ''}
        </span>

        <span className="hidden truncate text-xs text-neutral-500 sm:inline">
          {types.join(', ')}
        </span>

        <span className="tabular ml-auto shrink-0 text-xs font-semibold text-brand-700 dark:text-brand-300">
          {formatRange(Math.min(...prices), Math.max(...prices))}
        </span>
      </summary>

      {/*
       * Cards below `sm`, the table above.
       *
       * `overflow-x-auto` on its own did nothing here: the table is
       * `table-fixed w-full`, so it never grows past the container and never
       * has anything to scroll. The percentage columns simply collapsed —
       * `w-[14%]` of a 327px phone is a 46px "Unit" column.
       */}
      <ul className="divide-y divide-neutral-100 border-t border-neutral-100 sm:hidden dark:divide-neutral-800 dark:border-neutral-800">
        {rows.map((unit) => (
          <li key={unit.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/units/${unit.id}`}
                  className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {unit.unitNo}
                </Link>
                {unit.tower ? (
                  <span className="ml-1.5 text-xs text-neutral-500">{unit.tower}</span>
                ) : null}
                <p className="mt-0.5 text-xs text-neutral-500">
                  {unit.unitType} · {unit.areaSqm} sqm
                </p>
              </div>
              <StatusBadge status={unit.status} />
            </div>

            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="tabular text-sm font-semibold">
                {Money.fromCentavos(unit.purchasePriceCentavos).format()}
              </p>
              <Link
                href={`/units/${unit.id}`}
                className={
                  unit.status === 'Available'
                    ? 'shrink-0 text-xs font-semibold text-brand-600 hover:text-accent-500'
                    : 'shrink-0 text-xs text-neutral-500'
                }
              >
                {unit.status === 'Available' ? 'View & Reserve →' : 'View →'}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto border-t border-neutral-100 sm:block dark:border-neutral-800">
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className={`px-4 py-2 font-medium ${hasTower ? 'w-[14%]' : 'w-[16%]'}`}>Unit</th>
              {hasTower ? <th className="w-[12%] px-4 py-2 font-medium">Tower</th> : null}
              <th className={`px-4 py-2 font-medium ${hasTower ? 'w-[18%]' : 'w-[22%]'}`}>Type</th>
              <th className={`px-4 py-2 text-right font-medium ${hasTower ? 'w-[12%]' : 'w-[14%]'}`}>
                Area
              </th>
              <th className={`px-4 py-2 text-right font-medium ${hasTower ? 'w-[18%]' : 'w-[20%]'}`}>
                Price
              </th>
              <th className={`px-4 py-2 text-right font-medium ${hasTower ? 'w-[26%]' : 'w-[28%]'}`}>
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((unit) => (
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
                <td className="truncate px-4 py-2.5">{unit.unitType}</td>
                <td className="tabular px-4 py-2.5 text-right text-neutral-500">
                  {unit.areaSqm} sqm
                </td>
                <td className="tabular px-4 py-2.5 text-right font-medium">
                  {Money.fromCentavos(unit.purchasePriceCentavos).format()}
                </td>
                {/*
                 * Status AND the way forward, in one right-aligned cell.
                 *
                 * The unit number has always been a link to this unit's page,
                 * where the Reserve button lives — but as green text in a
                 * table it read as a label, not a door. A buyer asked outright
                 * where they were meant to reserve, which is the whole answer
                 * about how visible it was.
                 *
                 * It still routes to the unit page rather than straight to the
                 * wizard: floor plan, area and the full price breakdown are
                 * there, and nobody should start an ₱11M application without
                 * passing them. The label says both halves so it is not a
                 * promise of a shortcut that does not exist.
                 */}
                <td className="px-4 py-2.5 text-right">
                  <span className="mr-3 align-middle">
                    <StatusBadge status={unit.status} />
                  </span>
                  <Link
                    href={`/units/${unit.id}`}
                    className={
                      unit.status === 'Available'
                        ? 'whitespace-nowrap text-xs font-semibold text-brand-600 hover:text-accent-500'
                        : 'whitespace-nowrap text-xs text-neutral-500 hover:text-neutral-700'
                    }
                  >
                    {unit.status === 'Available' ? 'View & Reserve →' : 'View →'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
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
