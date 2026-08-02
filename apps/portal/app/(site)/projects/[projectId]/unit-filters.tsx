import Link from 'next/link';
import { cn } from '@sfsr/ui';

/**
 * Filter chips, rendered as plain links.
 *
 * Deliberately not a client component with state: each filter is a URL, so a
 * filtered view is shareable, back/forward works, and the server can push the
 * filter down into the Firestore query. Filtering therefore reads FEWER
 * documents rather than fetching everything and hiding rows in the browser
 * (30 reads → 8 for Studio-only, Development Plan.md §12.30).
 */

export interface FilterOption {
  readonly label: string;
  readonly value: string | null;
}

export function UnitFilters({
  projectId,
  current,
  towers,
  unitTypes,
}: {
  projectId: string;
  current: { tower?: string; type?: string; status?: string };
  towers: readonly string[];
  unitTypes: readonly string[];
}) {
  const href = (patch: Partial<typeof current>): string => {
    const next = { ...current, ...patch };
    const params = new URLSearchParams();
    if (next.tower) params.set('tower', next.tower);
    if (next.type) params.set('type', next.type);
    if (next.status) params.set('status', next.status);
    const qs = params.toString();
    return `/projects/${projectId}${qs ? `?${qs}` : ''}`;
  };

  const active = Boolean(current.tower ?? current.type ?? current.status);

  return (
    <div className="mb-4 space-y-2.5">
      <FilterRow
        label="Status"
        options={[
          { label: 'All', value: null },
          { label: 'Available', value: 'Available' },
          { label: 'On Hold', value: 'On Hold' },
          { label: 'Sold', value: 'Sold' },
        ]}
        selected={current.status ?? null}
        hrefFor={(value) => href({ status: value ?? undefined })}
      />

      {unitTypes.length > 1 ? (
        <FilterRow
          label="Type"
          options={[
            { label: 'All', value: null },
            ...unitTypes.map((t) => ({ label: t, value: t })),
          ]}
          selected={current.type ?? null}
          hrefFor={(value) => href({ type: value ?? undefined })}
        />
      ) : null}

      {towers.length > 1 ? (
        <FilterRow
          label="Tower"
          options={[{ label: 'All', value: null }, ...towers.map((t) => ({ label: t, value: t }))]}
          selected={current.tower ?? null}
          hrefFor={(value) => href({ tower: value ?? undefined })}
        />
      ) : null}

      {active ? (
        <Link
          href={`/projects/${projectId}`}
          className="inline-block text-xs text-brand-600 hover:underline"
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

function FilterRow({
  label,
  options,
  selected,
  hrefFor,
}: {
  label: string;
  options: readonly FilterOption[];
  selected: string | null;
  hrefFor: (value: string | null) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs text-neutral-400">{label}</span>
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <Link
            key={option.label}
            href={hrefFor(option.value)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs transition-colors',
              isSelected
                ? 'bg-brand-600 font-medium text-white'
                : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
