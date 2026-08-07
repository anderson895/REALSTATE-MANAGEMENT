import { can } from '@sfsr/domain';
import { getAdminFirestore, listTrippings, type TrippingRow } from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { SchedulingNotice } from './notice';
import { QueuePanel } from './queue';
import {
  AcceptedIcon,
  CancelledIcon,
  StatCard,
  UnclaimedIcon,
  VisitedIcon,
} from './stats';

/**
 * Tripping Schedule — SCHEDULING module.
 *
 * A claim queue, not an approval queue. INTERNAL.xls marks the approver column
 * N/A and says the first sales agent to accept takes the request, so there is
 * no supervisor step anywhere on this screen.
 *
 * ── The design ────────────────────────────────────────────────────────────
 *
 * Drawn from INTERNAL.xls sheet `USER INTERFACE`, the Sales Agent dashboard:
 * a navy-and-gold identity, a strip of counters across the top, then panels of
 * white cards. This is the first screen rebuilt to it — the shell around it is
 * still the old neutral one until the rest follows.
 *
 * Read uncached: two agents watching the same queue need to see a request
 * disappear the moment the other one takes it. The query is bounded.
 *
 * NOTE FOR THE DEMO — the role this screen was written for cannot sign in.
 * RBAC.xls has no Sales sheet, so no Sales account exists to seed. An IT
 * Administrator holds every module and can work the queue in their place.
 */
export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const session = await requireModule('SCHEDULING');
  const { error, done } = await searchParams;
  const mayAct = can(toActor(session), 'SCHEDULING', 'modify');

  const all = await listTrippings(getAdminFirestore(), PAGE_LIMIT);
  const open = all.filter((t) => t.status === 'Requested');
  const confirmed = all.filter((t) => t.status === 'Confirmed');
  const completed = all.filter((t) => t.status === 'Completed');
  const cancelled = all.filter((t) => t.status === 'Cancelled');
  const closed: TrippingRow[] = [...completed, ...cancelled];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-navy-800">
          Tripping Schedule
        </h1>
        {/* The gold rule under the heading is the login screen's divider,
            carried inward. It is the cheapest piece of the identity to keep
            consistent and the one that marks every page as this system's. */}
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          Site visit requests from the Portal. The first agent to accept a request owns the
          callback — there is no approval step.
        </p>
      </header>

      {/*
       * Counters, in the order a request moves through them.
       *
       * These count the rows ON THIS PAGE, not the collection, and the caption
       * under the last panel says so. Presenting a capped figure as a total is
       * the sort of number someone repeats in a meeting.
       */}
      <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unclaimed" value={open.length} tone="sky" icon={UnclaimedIcon} />
        <StatCard label="Accepted" value={confirmed.length} tone="emerald" icon={AcceptedIcon} />
        <StatCard label="Visited" value={completed.length} tone="navy" icon={VisitedIcon} />
        <StatCard label="Cancelled" value={cancelled.length} tone="rose" icon={CancelledIcon} />
      </div>

      <SchedulingNotice error={error} done={done} />

      {!mayAct ? (
        <p className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          You can view and print this queue but not accept from it.
        </p>
      ) : null}

      <QueuePanel
        title="Unclaimed"
        meta={`${open.length} waiting`}
        rows={open}
        mayAct={mayAct}
        empty={{
          title: 'No open requests',
          description:
            'Requests appear here the moment a buyer asks for a site visit from the Portal.',
        }}
      />

      <QueuePanel
        title="Accepted"
        meta={`${confirmed.length} scheduled`}
        rows={confirmed}
        mayAct={mayAct}
        empty={{
          title: 'Nothing accepted yet',
          description: 'Accepted visits move here with the name of the agent who claimed them.',
        }}
      />

      {closed.length > 0 ? (
        <QueuePanel
          title="Closed"
          meta={`${completed.length} visited · ${cancelled.length} cancelled`}
          rows={closed}
          mayAct={false}
        />
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        Showing the {PAGE_LIMIT} soonest visits; the counters above describe those rows, not the
        whole collection. Accepting runs inside a Firestore transaction, so two agents pressing
        Accept at the same moment cannot both come away with the visit — the second is told who
        took it.
      </p>
    </div>
  );
}

/**
 * How many requests one page shows.
 *
 * Named because the caption quotes it. A bare 60 in the query and the word
 * "sixty" in the prose is how they end up disagreeing.
 */
const PAGE_LIMIT = 60;
