import { Percent } from 'lucide-react';
import { canManageDiscounts } from '@sfsr/domain';
import { getAdminFirestore, getDiscountSchedule } from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';
import { DiscountForm } from './discount-form';

/**
 * Promotional discount rates — Documentation's screen.
 *
 * comments.doc: "Pag may revision sa discount or special discount promo need
 * sya iedit sa internal, ang incharge sa pagpalit ng discount is
 * Documentation." Until this page existed the rates were compiled into
 * `discount-strategy.ts`, and revising one meant a developer, a pull request
 * and a deployment.
 *
 * ── Why other roles can reach it read-only ───────────────────────────────
 *
 * The route sits behind APPROVAL_MONITORING, which Documentation holds — but
 * so does a Documentation Supervisor, and Sales needs to be able to see what it
 * is quoting. Everyone who gets here sees the rates; `canManageDiscounts`
 * decides who sees a form. A screen that hides the numbers from the people who
 * have to quote them would send them back to asking over the phone, which is
 * what a published rate is for.
 */
export default async function DiscountsPage() {
  const session = await requireModule('APPROVAL_MONITORING');
  const actor = toActor(session);
  const canEdit = canManageDiscounts(actor);

  // COST: 1 read. Not cached here on purpose — this is the screen where the
  // number is being changed, and a stale reading of what you are about to edit
  // is worse than a round trip.
  const record = await getDiscountSchedule(getAdminFirestore());

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-navy-700"
          >
            <Percent className="h-4 w-4" strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-navy-800">Discount Rates</h1>
        </div>
        <div aria-hidden="true" className="mt-2.5 h-0.5 w-16 rounded-full bg-gold-500" />

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">
          {canEdit
            ? 'The promotional discount offered at each down payment tier. Changes apply to new reservations only — anything already submitted keeps the rate it was sold under.'
            : 'The promotional discount offered at each down payment tier. These are maintained by the Documentation Department.'}
        </p>
      </header>

      <DiscountForm
        schedule={record.schedule}
        canEdit={canEdit}
        isDefault={record.isDefault}
        updatedBy={record.updatedBy}
        updatedAt={record.updatedAt ? record.updatedAt.toLocaleString('en-PH') : null}
      />
    </div>
  );
}
