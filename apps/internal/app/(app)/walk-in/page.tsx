import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { can } from '@sfsr/domain';
import { getAdminFirestore, listProjects, listUnits } from '@sfsr/infrastructure/server';
import { PageHeader } from '@sfsr/ui';
import { requireModule, toActor } from '@/lib/session';
import { WalkInForm, type ProjectOption, type UnitOption } from './walk-in-form';

export const metadata: Metadata = { title: 'Walk-in Reservation' };

/**
 * The counter form — a reservation taken from a buyer standing in the office.
 *
 * note.txt: "Add walking reservation on internal same process sa web portal",
 * and "documentation ang in charge for walk in application".
 *
 * ── Why the units are loaded here and not searched from the form ──────────
 *
 * There are five projects and at most thirty units each, and only the
 * Available ones can be reserved — a list small enough to hand over whole. The
 * alternative is a search action per keystroke, which costs a Firestore query
 * each time to browse a list that fits in a select box.
 *
 * COST: 5 project reads plus one read per available unit, on a page only
 * Documentation opens and only when a buyer is in front of them.
 */
export default async function WalkInPage() {
  const session = await requireModule('RESERVATION_VERIFICATION');

  /*
   * `create`, not merely access to the module.
   *
   * `requireModule` above lets in anyone with any grant, which includes Billing
   * (view/modify/print) and Sales (view/print). Neither may raise a reservation
   * — the client moved walk-ins to Documentation — and the server actions
   * refuse them regardless. This is so they get a 404 rather than a form that
   * rejects them at the last step.
   */
  if (!can(toActor(session), 'RESERVATION_VERIFICATION', 'create')) notFound();

  const db = getAdminFirestore();
  const projects = await listProjects(db);

  const unitsByProject = await Promise.all(
    projects.map(async (project) => ({
      project,
      units: await listUnits(db, project.id, { status: 'Available' }),
    })),
  );

  const projectOptions: ProjectOption[] = unitsByProject.map(({ project, units }) => ({
    id: project.id,
    name: project.name,
    units: units.map(
      (unit): UnitOption => ({
        id: unit.id,
        label: `${unit.unitNo} · ${unit.unitType} · ${unit.areaSqm} sqm`,
        priceCentavos: unit.purchasePriceCentavos,
      }),
    ),
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Walk-in Reservation"
        description={`Encoded by ${session.displayName} · the buyer must have signed the printed reservation form`}
      />
      <WalkInForm projects={projectOptions} />
    </div>
  );
}
