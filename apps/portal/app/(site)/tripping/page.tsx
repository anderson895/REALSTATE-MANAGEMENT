import type { Metadata } from 'next';
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
              return (
                <li key={doc.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{String(data.projectName ?? data.projectId)}</p>
                    <p className="text-xs text-neutral-500">
                      Preferred: {String(data.preferredDate ?? '—')}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-500">{String(data.status ?? 'Requested')}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
