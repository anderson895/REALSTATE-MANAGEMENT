import type { Metadata } from 'next';
import { Timestamp } from 'firebase-admin/firestore';
import { trippingReference } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { Card, EmptyState, PageHeader } from '@sfsr/ui';
import { requireCapability } from '@/lib/session';
import { getCachedProjects } from '@/lib/catalog';
import { TrippingForm } from './tripping-form';

export const metadata: Metadata = { title: 'Request a Site Viewing' };

export default async function TrippingPage() {
  // "request tripping" is an Initial Account capability — a Guest User is sent
  // to sign in first (RESERVATION.doc, Client Access).
  const session = await requireCapability('requestTripping');

  const [projects, existing] = await Promise.all([
    getCachedProjects(),
    // COST: one read per existing request — 0 for a new buyer.
    getAdminFirestore()
      .collection('trippings')
      .where('clientId', '==', session.uid)
      .limit(10)
      .get(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="Request a Site Viewing"
        description="Visit the property in person. A sales agent will confirm your preferred schedule."
      />

      <Card className="mb-8 p-5">
        <TrippingForm
          projects={projects.map((p) => ({ id: p.id, name: p.name, location: p.location }))}
        />
      </Card>

      <h2 className="mb-3 text-sm font-medium">Your requests</h2>
      {existing.empty ? (
        <EmptyState
          title="No site viewings requested yet"
          description="Once you submit a request, it appears here with the schedule confirmed by your assigned sales agent."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {existing.docs.map((doc) => {
              const data = doc.data();
              // The same helper the Sales Agent's queue renders from, so the
              // reference the buyer reads out is character-for-character the
              // one the agent searches for.
              const reference = trippingReference(
                doc.id,
                data.requestedAt instanceof Timestamp ? data.requestedAt.toDate() : null,
              );
              return (
                <li key={doc.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    {/*
                     * Above the project name, not beside it. This is what the
                     * buyer quotes when they ring up about the visit, so it
                     * has to be the first thing found on the row rather than
                     * something recovered from the end of a line.
                     */}
                    <p className="tabular text-[11px] font-semibold tracking-wide text-brand-700 dark:text-brand-400">
                      {reference}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {String(data.projectName ?? data.projectId)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Preferred: {String(data.preferredDate ?? '—')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {String(data.status ?? 'Requested')}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        Quote the reference above when you follow up about a viewing — it is how your sales agent
        finds the request.
      </p>
    </div>
  );
}
