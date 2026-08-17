'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { BusyOverlay, FormError, Modal, TextField } from '@sfsr/ui';
import { suggestUnitPrefix } from '@/lib/inventory';
import { createProject } from './actions';

/**
 * Add a project.
 *
 * ── Why the code and the prefix are both typed ───────────────────────────
 *
 * The CODE becomes the document id — every seeded project has `id === code`,
 * units point at it, the Portal routes on it, and the Cloudinary folder is
 * named after it. Generating a surrogate would give a building two names.
 *
 * The PREFIX is what its unit ids will start with: `EU031` for Emerald Park,
 * not `U031`. It is suggested from the code and stays editable, because the
 * seeded five do not follow one rule — The Legaspi Place is `TLP001` with units
 * on `U`, and Skyline Quarter is `SQR003` with units on `SQ`.
 *
 * Neither can be changed afterwards without rewriting every unit that refers to
 * it, which is why they are here and not on an edit form.
 */
export function AddProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [developer, setDeveloper] = useState('St. Francis Square Realty Corporation');
  const [location, setLocation] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [floorsRaw, setFloorsRaw] = useState('');
  const [theme, setTheme] = useState('');
  const [unitPrefix, setUnitPrefix] = useState('');
  const [prefixTouched, setPrefixTouched] = useState(false);

  function reset() {
    setErrors({});
    setCode('');
    setName('');
    setDeveloper('St. Francis Square Realty Corporation');
    setLocation('');
    setBuildingType('');
    setFloorsRaw('');
    setTheme('');
    setUnitPrefix('');
    setPrefixTouched(false);
  }

  function onCodeChange(next: string) {
    const upper = next.toUpperCase();
    setCode(upper);
    if (!prefixTouched) setUnitPrefix(suggestUnitPrefix(upper));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await createProject({
        code,
        name,
        developer,
        location,
        buildingType,
        floorsRaw,
        theme,
        unitPrefix,
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
    <>
    <BusyOverlay show={pending} label="Adding the project…" />
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      size="lg"
      title="Add a project"
      description="A new building. Units are added to it afterwards, one at a time or as the floors are released."
      trigger={
        <button
          type="button"
          className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-navy-300 px-3.5 py-2 text-sm font-semibold text-navy-800 transition-colors hover:bg-navy-50"
        >
          <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Add project
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.form ? <FormError>{errors.form}</FormError> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Project code"
            name="code"
            required
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            error={errors.code}
            hint="2–4 letters then 3 digits, e.g. MPR006. This becomes the project's ID everywhere."
            autoComplete="off"
          />
          <TextField
            label="Unit ID prefix"
            name="unitPrefix"
            required
            value={unitPrefix}
            onChange={(e) => {
              setPrefixTouched(true);
              setUnitPrefix(e.target.value.toUpperCase());
            }}
            error={errors.unitPrefix}
            hint="Its units will be numbered from here — MP001, MP002. Must not clash with another project."
            autoComplete="off"
          />
        </div>

        <TextField
          label="Project name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="Meridian Park Residences"
          autoComplete="off"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Developer"
            name="developer"
            required
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
            error={errors.developer}
            autoComplete="off"
          />
          <TextField
            label="Location"
            name="location"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            error={errors.location}
            placeholder="Ortigas Center, Pasig City"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Building type"
            name="buildingType"
            required
            value={buildingType}
            onChange={(e) => setBuildingType(e.target.value)}
            error={errors.buildingType}
            placeholder="Premium High-Rise Condominium"
            autoComplete="off"
          />
          <TextField
            label="Number of floors"
            name="floorsRaw"
            required
            value={floorsRaw}
            onChange={(e) => setFloorsRaw(e.target.value)}
            error={errors.floorsRaw}
            hint={'Free text — the workbook holds both "42" and "38 Floors".'}
            autoComplete="off"
          />
        </div>

        <TextField
          label="Theme"
          name="theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          error={errors.theme}
          hint="Optional. The one line shown under the project on the buyer portal."
          placeholder="Bay-view luxury living"
          autoComplete="off"
        />

        <p className="rounded-md bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
          Renders and floor plans are not uploaded here. Until they are, the portal draws a branded
          placeholder rather than a broken image.
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
            {pending ? 'Adding…' : 'Add project'}
          </button>
        </div>
      </form>
    </Modal>
    </>
  );
}
