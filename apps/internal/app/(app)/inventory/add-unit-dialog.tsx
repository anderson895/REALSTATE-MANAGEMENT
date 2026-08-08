'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { UNIT_TYPES, type UnitType } from '@sfsr/domain';
import { FormError, Modal, TextField, fieldClass } from '@sfsr/ui';
import { derivePurchasePrice } from '@/lib/inventory';
import { createUnit } from './actions';

export interface ProjectChoice {
  readonly id: string;
  readonly name: string;
}

/**
 * Add a unit to a project.
 *
 * ── The purchase price fills itself, and stays editable ──────────────────
 *
 * All 150 seeded units satisfy `area × price per sqm` exactly, so typing both
 * and then a third number that must agree with them is a calculator step and an
 * opportunity to fat-finger a ₱6,000,000 figure. It is derived as those two
 * change, and marked as derived — until somebody edits it, after which it is
 * left alone. A penthouse with a view premium is a real thing.
 *
 * ── What is NOT on this form ─────────────────────────────────────────────
 *
 * Status. A new unit is always `Available`, which is what `Unit.create()` in
 * the domain enforces too: a unit born `Sold` would have no reservation behind
 * it, and the entity's transition rules would have no way to explain it.
 * Selling happens through the reservation workflow or not at all.
 */
export function AddUnitDialog({ projects }: { projects: readonly ProjectChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [tower, setTower] = useState('');
  const [floor, setFloor] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('Studio');
  const [areaSqm, setAreaSqm] = useState('');
  const [pricePerSqm, setPricePerSqm] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);

  function reset() {
    setErrors({});
    setTower('');
    setFloor('');
    setUnitNo('');
    setAreaSqm('');
    setPricePerSqm('');
    setPurchasePrice('');
    setPriceTouched(false);
  }

  function reprice(nextArea: string, nextRate: string) {
    if (priceTouched) return;
    setPurchasePrice(derivePurchasePrice(nextArea, nextRate));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await createUnit({
        projectId,
        tower,
        floor,
        unitNo,
        unitType,
        areaSqm,
        pricePerSqm,
        purchasePrice,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? { form: result.error });
        return;
      }

      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      size="lg"
      title="Add a unit"
      description="Its ID is allocated from the project's own series. A new unit always starts Available."
      trigger={
        <button
          type="button"
          disabled={projects.length === 0}
          className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-navy-800 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Add unit
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.form ? <FormError>{errors.form}</FormError> : null}

        <div>
          <label htmlFor="projectId" className="block text-sm font-medium">
            Project
            <span className="ml-0.5 text-rose-500">*</span>
          </label>
          <select
            id="projectId"
            name="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.id})
              </option>
            ))}
          </select>
          {errors.projectId ? (
            <p className="mt-1 text-xs text-rose-600">{errors.projectId}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Tower"
            name="tower"
            value={tower}
            onChange={(e) => setTower(e.target.value)}
            error={errors.tower}
            hint="Optional"
            placeholder="Tower A"
            autoComplete="off"
          />
          <TextField
            label="Floor"
            name="floor"
            required
            inputMode="numeric"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            error={errors.floor}
            placeholder="12"
            autoComplete="off"
          />
          <TextField
            label="Unit number"
            name="unitNo"
            required
            value={unitNo}
            onChange={(e) => setUnitNo(e.target.value)}
            error={errors.unitNo}
            placeholder="A-1201"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="unitType" className="block text-sm font-medium">
              Unit type
              <span className="ml-0.5 text-rose-500">*</span>
            </label>
            <select
              id="unitType"
              name="unitType"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as UnitType)}
              className={`${fieldClass} mt-1.5`}
            >
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {errors.unitType ? (
              <p className="mt-1 text-xs text-rose-600">{errors.unitType}</p>
            ) : null}
          </div>

          <TextField
            label="Floor area (sqm)"
            name="areaSqm"
            required
            inputMode="decimal"
            value={areaSqm}
            onChange={(e) => {
              setAreaSqm(e.target.value);
              reprice(e.target.value, pricePerSqm);
            }}
            error={errors.areaSqm}
            placeholder="24"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Price per sqm (₱)"
            name="pricePerSqm"
            required
            inputMode="decimal"
            value={pricePerSqm}
            onChange={(e) => {
              setPricePerSqm(e.target.value);
              reprice(areaSqm, e.target.value);
            }}
            error={errors.pricePerSqm}
            placeholder="250,000"
            autoComplete="off"
          />
          <TextField
            label="Purchase price (₱)"
            name="purchasePrice"
            required
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => {
              setPriceTouched(true);
              setPurchasePrice(e.target.value);
            }}
            error={errors.purchasePrice}
            hint={
              priceTouched
                ? 'Entered by hand — no longer follows area × rate.'
                : 'Area × price per sqm. Type here to override.'
            }
            autoComplete="off"
          />
        </div>

        <p className="rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          This is the figure a buyer is quoted from. It drives the down payment, the discount tier
          and the whole amortisation schedule — and the change is recorded against your name.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Adding…' : 'Add unit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
