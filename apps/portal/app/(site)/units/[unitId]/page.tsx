import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money, clientCan, isListedToBuyers } from '@sfsr/domain';
import { cloudinaryUrl } from '@sfsr/ui';
import { getCachedProject, getCachedUnit } from '@/lib/catalog';
import { getTier } from '@/lib/session';
import { PriceCalculator } from './price-calculator';
import { ReserveButton } from './reserve-button';

/** RESERVATION.doc, STEP 2: "Reservation Fee ₱_____ (System Generated- put 50,000.00)". */
const RESERVATION_FEE_CENTAVOS = 5_000_000;

export async function generateMetadata({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await getCachedUnit(unitId);
  return { title: unit ? `Unit ${unit.unitNo}` : 'Unit' };
}

export default async function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;

  // COST on a cache miss: 2 reads. Zero on a hit.
  const unit = await getCachedUnit(unitId);
  if (!unit) notFound();

  const [project, tier] = await Promise.all([getCachedProject(unit.projectId), getTier()]);
  if (!project) notFound();

  const floorPlanUrl = project.floorPlans[unit.unitType] ?? null;
  const canReserve = clientCan(tier, 'reserveUnit');

  /*
   * `isListedToBuyers`, not `status === 'Available'`.
   *
   * This page is reachable by a direct link — from a bookmark, a message from
   * an agent, or a guess — so it is the one surface the catalogue filter
   * cannot cover. Asking the same predicate the listings ask keeps On Hold,
   * Sold and withheld types out by the same rule, rather than by a second
   * condition here that would drift away from the first.
   *
   * The page still renders rather than 404s: someone following a bookmark to a
   * unit that has since sold deserves a sentence, not a dead end.
   */
  const listed = isListedToBuyers(unit);

  // Parking is priced from the project's cheapest slot rather than by loading
  // the slot list — the picker belongs in the reservation wizard, and reading
  // 30 parking documents here would triple the cost of the page.
  const parkingPriceCentavos = project.stats.availableParking > 0 ? 60_000_000 : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 text-xs text-neutral-500">
        <Link href="/projects" className="hover:text-brand-600">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${project.id}`} className="hover:text-brand-600">
          {project.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-700 dark:text-neutral-300">Unit {unit.unitNo}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          {/*
           * No status badge. comments.doc puts unit status with "Billing,
           * documentation, marketing and sales" — the panel further down says
           * whether this one can be reserved, which is the only part of the
           * answer a buyer needs, and it says it without naming On Hold or Sold.
           */}
          <h1 className="text-xl font-semibold">Unit {unit.unitNo}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {unit.unitType} · {project.name}
            {unit.tower ? ` · ${unit.tower}` : ''} · Floor {unit.floor}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-2xl font-semibold">
            {Money.fromCentavos(unit.purchasePriceCentavos).format()}
          </p>
          <p className="tabular mt-0.5 text-xs text-neutral-500">
            {Money.fromCentavos(unit.pricePerSqmCentavos).format()} per sqm
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {/*
           * A photograph of THIS unit, when Marketing has published one.
           *
           * Above the floor plan, because a room is more use to a buyer than a
           * drawing of one — but rendered only when it exists, and never as a
           * placeholder. These are pre-selling towers: most units cannot be
           * photographed yet, and an empty frame on every one of them would
           * read as something broken rather than something absent.
           */}
          {unit.photoUrl ? (
            <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
                Unit {unit.unitNo}
              </h2>
              <a
                href={cloudinaryUrl(unit.photoUrl, { width: 1600 })}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <div className="relative aspect-[4/3] bg-neutral-50 dark:bg-neutral-800">
                  <Image
                    src={cloudinaryUrl(unit.photoUrl, { width: 900, height: 675, crop: 'fill' })}
                    alt={`Unit ${unit.unitNo} at ${project.name}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover"
                  />
                </div>
              </a>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
              Floor plan
            </h2>
            {floorPlanUrl ? (
              <a
                href={cloudinaryUrl(floorPlanUrl, { width: 1600 })}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <div className="relative aspect-square bg-neutral-50 dark:bg-neutral-800">
                  <Image
                    src={cloudinaryUrl(floorPlanUrl, { width: 700, height: 700, crop: 'fit' })}
                    alt={`${unit.unitType} floor plan — ${project.name}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-contain p-2"
                  />
                </div>
              </a>
            ) : (
              // 44 of 150 units have no plan (Development Plan.md §12.11).
              // Degrade to an honest message, never a broken image.
              <div className="flex aspect-square flex-col items-center justify-center gap-2 border-t border-dashed border-neutral-200 p-8 text-center dark:border-neutral-800">
                <p className="text-sm font-medium text-neutral-500">Floor plan not yet published</p>
                <p className="max-w-xs text-xs text-neutral-400">
                  The {unit.unitType} layout for {project.name} is not available online yet. Request
                  a site viewing to see the unit in person, or contact your sales agent for a copy.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="border-b border-neutral-200 px-5 py-3 text-sm font-medium dark:border-neutral-800">
              Unit details
            </h2>
            <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
              <Spec label="Project" value={project.name} />
              <Spec label="Unit number" value={unit.unitNo} />
              {unit.tower ? <Spec label="Tower" value={unit.tower} /> : null}
              <Spec label="Floor" value={String(unit.floor)} />
              <Spec label="Unit type" value={unit.unitType} />
              <Spec label="Floor area" value={`${unit.areaSqm} sqm`} />
              <Spec label="Location" value={project.location} />
              <Spec label="Developer" value={project.developer} />
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <PriceCalculator
            unitPriceCentavos={unit.purchasePriceCentavos}
            parkingPriceCentavos={parkingPriceCentavos}
            reservationFeeCentavos={RESERVATION_FEE_CENTAVOS}
          />

          <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            {!listed ? (
              <>
                {/*
                 * Deliberately does not say WHICH — sold, on hold, or a type
                 * that has been withdrawn all read the same here. Naming it
                 * would put back exactly what the client asked to take away,
                 * on the one page they are most likely to reach by link.
                 */}
                <p className="text-sm font-medium">This unit is not available for reservation</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Browse the other units in {project.name} — there may be one like it on another
                  floor.
                </p>
                <Link
                  href={`/projects/${project.id}`}
                  className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  See available units
                </Link>
              </>
            ) : canReserve ? (
              <>
                <p className="text-sm font-medium">Ready to reserve this unit?</p>
                <p className="mt-1 text-sm text-neutral-500">
                  A {Money.fromCentavos(RESERVATION_FEE_CENTAVOS).format()} reservation fee applies
                  and forms part of the purchase price. It is non-refundable and non-transferable.
                </p>
                <ReserveButton unitId={unit.id} unitNo={unit.unitNo} />
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Create an account to reserve</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Registering lets you schedule a site viewing, request a formal computation, and
                  submit a reservation application online.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href="/register"
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Create an Account
                  </Link>
                  <Link
                    href={`/login?next=/units/${unit.id}`}
                    className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Sign In
                  </Link>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
