import { Globe, Store } from 'lucide-react';
import { SALES_VISIBLE_STATUSES } from '@sfsr/domain';
import { getAdminFirestore, listClientMasterfiles } from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';
import { requireModule } from '@/lib/session';
import { STATUS_LABELS, formatDate } from '@/lib/reservations';

/**
 * Client Master Files.
 *
 * note.txt: "Clients profiles change to Client Master Files — Approved
 * Reservation from (Internal and Portal)."
 *
 * ── What a master file is, and is not ─────────────────────────────────────
 *
 * Not a list of registered accounts. A browser who signed up, looked at three
 * units and left is not a client of this company, and putting them in the same
 * file as a buyer who has completed a purchase makes the file useless for the
 * thing it is for. So this is built from the APPROVED reservations and grouped
 * by buyer — a master file exists because somebody bought something.
 *
 * Both channels appear in one list, which is what "(Internal and Portal)" is
 * asking for. Every record today reads Portal because the walk-in flow is not
 * built yet; the column is there so it does not have to be retrofitted when it
 * is, and so nobody has to guess afterwards which sale came in over the counter.
 *
 * Approved statuses come from `SALES_VISIBLE_STATUSES` — the same list the
 * Sales screen and the Security Rules use, rather than a second copy that
 * could drift.
 */
export default async function ClientMasterFilesPage() {
  await requireModule('CLIENT_PROFILE');

  const entries = await listClientMasterfiles(getAdminFirestore(), SALES_VISIBLE_STATUSES, 50);
  const total = entries.reduce((n, e) => n + e.reservations.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">Client Master Files</h1>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Buyers with an approved reservation, from the Portal and from walk-in. A registered
          account with nothing approved is not a master file and does not appear here.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
            Approved Buyers
          </h2>
          <span className="text-[11px] font-medium text-neutral-500">
            {entries.length === 0
              ? 'none yet'
              : `${entries.length} ${entries.length === 1 ? 'buyer' : 'buyers'} · ${total} approved`}
          </span>
        </header>

        {entries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-800">No master files yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
              A buyer appears here once Billing has cleared their payment, Documentation has
              accepted the requirements, and a Documentation Supervisor has approved.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <li key={entry.client.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-neutral-800">{entry.client.name}</p>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      entry.client.tier === 'PERMANENT'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-navy-50 text-navy-700',
                    )}
                  >
                    {entry.client.tier}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {[entry.client.username, entry.client.email, entry.client.mobile]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                <ul className="mt-3 space-y-1.5">
                  {entry.reservations.map((r) => (
                    <li
                      key={r.number}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-neutral-50 px-3 py-2 text-xs"
                    >
                      <span className="tabular font-semibold text-navy-700">{r.number}</span>
                      <SourceTag source={r.source} />
                      <span className="text-neutral-600">{r.projectName}</span>
                      <span className="text-neutral-400">·</span>
                      <span className="text-neutral-600">{r.unitId}</span>
                      <span className="ml-auto text-neutral-500">
                        {STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status}
                        {r.approvedAt ? ` · ${formatDate(r.approvedAt)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Which counter the sale came over. */
function SourceTag({ source }: { source: 'Portal' | 'Internal' }) {
  const Icon = source === 'Internal' ? Store : Globe;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
        source === 'Internal' ? 'bg-gold-100 text-gold-900' : 'bg-sky-50 text-sky-700',
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {source === 'Internal' ? 'Walk-in' : 'Portal'}
    </span>
  );
}
