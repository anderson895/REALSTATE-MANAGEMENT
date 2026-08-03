import Link from 'next/link';

/**
 * The landing page's search controls, repeated on the results page.
 *
 * Without this a buyer who arrived from the home page had to navigate BACK to
 * the home page to widen a price range — the results page showed what they
 * asked for and gave them no way to ask for anything else.
 *
 * A plain GET form, like the one it mirrors: no client state, the URL is the
 * query, and a narrowed view is shareable. `defaultValue` seeds every control
 * from the current URL so the form always shows what is actually applied.
 */
export function UnitSearchBar({
  projects,
  unitTypes,
  current,
}: {
  projects: readonly { id: string; name: string }[];
  unitTypes: readonly string[];
  current: { project?: string; type?: string; min?: string; max?: string };
}) {
  const active = Boolean(current.project ?? current.type ?? current.min ?? current.max);

  const field =
    'min-w-32 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900';

  return (
    <form className="mb-6 flex flex-wrap items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <select name="project" aria-label="Project" defaultValue={current.project ?? ''} className={field}>
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select name="type" aria-label="Unit type" defaultValue={current.type ?? ''} className={field}>
        <option value="">Unit Type</option>
        {unitTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <input
        type="number"
        name="min"
        min="0"
        placeholder="Min. Price"
        aria-label="Minimum price"
        defaultValue={current.min ?? ''}
        className={field}
      />
      <input
        type="number"
        name="max"
        min="0"
        placeholder="Max. Price"
        aria-label="Maximum price"
        defaultValue={current.max ?? ''}
        className={field}
      />

      <button
        type="submit"
        className="shrink-0 rounded-md bg-accent-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-400"
      >
        Search
      </button>

      {active ? (
        <Link
          href="/units"
          className="shrink-0 rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
