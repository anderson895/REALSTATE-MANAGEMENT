'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, Search, Store } from 'lucide-react';
import { cn } from '@sfsr/ui';

/**
 * The search box note.txt asks for: "meron lang search field (unity number or
 * buyers name)".
 *
 * ── Why it filters in memory ─────────────────────────────────────────────
 *
 * The rows are already here. A project holds at most thirty units, so its whole
 * approved set arrives with the page and matching against it costs nothing per
 * keystroke. Querying Firestore instead would spend a read set on every
 * character to narrow a list that already fits on the screen — and Firestore
 * cannot do a substring match anyway, so "101" would have to be typed exactly
 * as "A-101" to find anything.
 *
 * ── What counts as a match ───────────────────────────────────────────────
 *
 * Unit number and buyer name, per the note, plus the reservation number and
 * username because they cost nothing extra and are what someone holding a
 * printout will have. Case-insensitive substring, so "101" finds A-101 and
 * "mendo" finds Mendoza.
 *
 * ── Why the rows arrive pre-formatted ────────────────────────────────────
 *
 * `formatDate` and `STATUS_LABELS` live in `@/lib/reservations`, which imports
 * `@sfsr/infrastructure/server` and therefore carries a `server-only` guard.
 * Importing them here would break the build; passing them in as props would
 * fail differently, because a function cannot cross the server/client boundary.
 * So the server does the formatting and this receives strings.
 */

export interface BuyerRow {
  readonly number: string;
  readonly clientId: string;
  readonly buyerName: string;
  readonly username: string;
  readonly unitNo: string;
  readonly unitType: string;
  readonly source: 'Portal' | 'Internal';
  /** Already localised by the server. */
  readonly statusLabel: string;
  readonly approvedLabel: string | null;
}

export function BuyerSearch({ rows, projectId }: { rows: readonly BuyerRow[]; projectId: string }) {
  const [term, setTerm] = useState('');

  const searching = term.trim() !== '';

  /*
   * Nothing is listed until something is typed.
   *
   * note.txt: "pagka pili ng project meron LANG search field... meron din
   * count ng unit sold." The screen opens as a search box and a number, not as
   * a roster — this is a file room, and a file room does not lay every folder
   * on the table when you walk in.
   *
   * The rows are all here regardless, because the filtering is in memory (see
   * above). Withholding them is a decision about the screen, not about what it
   * costs to fetch them.
   */
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (q === '') return [];
    return rows.filter((r) =>
      [r.unitNo, r.buyerName, r.number, r.username].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [rows, term]);

  return (
    <>
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          strokeWidth={2}
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search by unit number or buyer name"
          aria-label="Search by unit number or buyer name"
          className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Units sold
          </h2>
          <span className="text-[11px] font-medium text-neutral-500">
            {searching
              ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} of ${rows.length}`
              : `${rows.length} ${rows.length === 1 ? 'unit' : 'units'}`}
          </span>
        </header>

        {matches.length === 0 ? (
          <div className="px-6 py-12 text-center">
            {!searching ? (
              <>
                <p className="tabular text-3xl font-bold text-navy-800">{rows.length}</p>
                <p className="mt-1 text-sm font-medium text-navy-800">
                  {rows.length === 1 ? 'unit sold' : 'units sold'}
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
                  {rows.length === 0
                    ? 'A buyer appears here once Billing has cleared their payment, Documentation has accepted the requirements, and a Documentation Supervisor has approved.'
                    : 'Search above by unit number or buyer name to open a master file.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-navy-800">Nothing matches that search</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
                  Try the unit number as it appears on the plan, or part of the buyer’s name.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {matches.map((row) => (
              <li key={row.number}>
                <Link
                  href={`/clients/${projectId}/${row.clientId}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-neutral-50"
                >
                  <span className="tabular w-20 shrink-0 text-sm font-semibold text-navy-700">
                    {row.unitNo}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">
                      {row.buyerName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      {[row.number, row.unitType].filter(Boolean).join(' · ')}
                    </span>
                  </span>

                  <SourceTag source={row.source} />

                  <span className="shrink-0 text-right text-xs text-neutral-500">
                    {row.statusLabel}
                    {row.approvedLabel ? (
                      <span className="mt-0.5 block text-[11px] text-neutral-400">
                        {row.approvedLabel}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Which counter the sale came over. */
function SourceTag({ source }: { source: 'Portal' | 'Internal' }) {
  const Icon = source === 'Internal' ? Store : Globe;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
        source === 'Internal' ? 'bg-gold-100 text-gold-900' : 'bg-sky-50 text-sky-700',
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {source === 'Internal' ? 'Walk-in' : 'Portal'}
    </span>
  );
}
