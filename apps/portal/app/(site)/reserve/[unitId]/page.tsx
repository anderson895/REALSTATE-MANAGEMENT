import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Money, isListedToBuyers } from '@sfsr/domain';
import { getAdminFirestore, getUnit, listAvailableParking } from '@sfsr/infrastructure/server';
import { Card, PageHeader } from '@sfsr/ui';
import { getCachedProject } from '@/lib/catalog';
import { requireCapability } from '@/lib/session';
import { ReservationWizard } from './wizard';

export const metadata: Metadata = { title: 'Reserve a Unit' };

/** RESERVATION.doc, STEP 2: "Reservation Fee ₱_____ (System Generated- put 50,000.00)". */
const RESERVATION_FEE_CENTAVOS = 5_000_000;

export default async function ReservePage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;

  // "reserve unit" is an Initial Account capability; a guest is sent to sign in.
  const session = await requireCapability('reserveUnit');
  const db = getAdminFirestore();

  // Read the unit UNCACHED. This is the one page where a stale "Available"
  // would walk a buyer through eight steps only to be rejected at submit.
  const unit = await getUnit(db, unitId);
  if (!unit) notFound();

  /*
   * The same predicate the catalogue uses, so a type withdrawn from sale
   * cannot be reserved through a link that skips the listings. `status !==
   * 'Available'` would have let a Penthouse straight through — it is
   * Available, it is simply not for sale at the moment.
   *
   * Still not the control that prevents a double sale: `createReservation`
   * re-reads the unit inside its transaction, and that is what holds.
   */
  if (!isListedToBuyers(unit)) {
    redirect(`/units/${unitId}`);
  }

  const [project, parking, clientDoc] = await Promise.all([
    // CACHED, unlike the unit above. A project's name and location do not go
    // stale in a way that can hurt anyone, and this entry is already warm from
    // the browse pages — so it costs no read and no wait on the slowest route
    // in the portal. The UNIT is what has to be fresh, and it still is.
    getCachedProject(unit.projectId),
    listAvailableParking(db, unit.projectId),
    // The buyer already gave us their name and contact details at
    // registration. RESERVATION.doc: "The system automatically retrieves the
    // buyer's basic information from the registered Initial Account."
    db.collection('clients').doc(session.uid).get(),
  ]);

  if (!project) notFound();
  const client = clientDoc.data() ?? {};

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-xs text-neutral-500">
        <Link href={`/projects/${project.id}`} className="hover:text-brand-600">
          {project.name}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/units/${unit.id}`} className="hover:text-brand-600">
          Unit {unit.unitNo}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-700 dark:text-neutral-300">Reserve</span>
      </nav>

      <PageHeader
        title="Condominium Unit Reservation Application"
        description="Fields marked with * are required. Your application is subject to document verification, payment verification, and approval by St. Francis Square Realty Corporation."
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              Unit {unit.unitNo}
              {unit.tower ? ` · ${unit.tower}` : ''} · Floor {unit.floor}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {unit.unitType} · {unit.areaSqm} sqm · {project.name}
            </p>
          </div>
          <p className="tabular text-lg font-semibold">
            {Money.fromCentavos(unit.purchasePriceCentavos).format()}
          </p>
        </div>
      </Card>

      <ReservationWizard
        unit={{
          id: unit.id,
          unitNo: unit.unitNo,
          unitType: unit.unitType,
          tower: unit.tower,
          floor: unit.floor,
          areaSqm: unit.areaSqm,
          purchasePriceCentavos: unit.purchasePriceCentavos,
          pricePerSqmCentavos: unit.pricePerSqmCentavos,
        }}
        project={{ id: project.id, name: project.name, location: project.location }}
        parking={parking.map((slot) => ({
          id: slot.id,
          label: `${slot.parkingNo} · ${slot.level} · ${slot.parkingType}`,
          parkingType: slot.parkingType,
          purchasePriceCentavos: slot.purchasePriceCentavos,
        }))}
        buyer={{
          fullName: [client.firstName, client.middleName, client.lastName, client.suffix]
            .filter(Boolean)
            .join(' '),
          dateOfBirth: String(client.dateOfBirth ?? ''),
          sex: String(client.sex ?? ''),
          email: String(client.email ?? ''),
          mobile: String(client.mobile ?? ''),
        }}
        reservationFeeCentavos={RESERVATION_FEE_CENTAVOS}
      />
    </div>
  );
}
