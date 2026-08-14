'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SEX_OPTIONS } from '@sfsr/domain';
import { FormError, SubmitButton, TextField, fieldClass } from '@sfsr/ui';
import { updateProfile } from './actions';

/**
 * The buyer's own personal information, editable in place.
 *
 * ── Why there is no "Edit" toggle ────────────────────────────────────────
 *
 * A read-only view with a pencil that swaps it for a form is two renderings of
 * the same seven fields, kept in step by hand. The fields are short and the
 * page is already behind a login, so they are simply inputs — and Save stays
 * disabled until something actually differs, which is the only thing the
 * read-only mode was really protecting against.
 *
 * ── What cannot be edited, and why it is still shown ─────────────────────
 *
 * Email address is rendered here as text rather than dropped from the section.
 * It is part of "my personal information" whether or not it can be changed, and
 * a buyer who cannot find their email on their own profile assumes the system
 * lost it. The same reasoning already applies to the username in the Account
 * card below.
 */

export interface ProfileValues {
  readonly firstName: string;
  readonly middleName: string;
  readonly lastName: string;
  readonly suffix: string;
  /** `YYYY-MM-DD`, the format `<input type="date">` reads and writes. */
  readonly dateOfBirth: string;
  readonly sex: string;
  readonly mobile: string;
}

export function EditProfile({ initial, email }: { initial: ProfileValues; email: string }) {
  const [form, setForm] = useState<ProfileValues>(initial);
  // What the server last confirmed as saved. Compared against `form` to decide
  // whether Save has anything to do — using `initial` would leave the button
  // live after a successful save, inviting a pointless second write.
  const [saved, setSaved] = useState<ProfileValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const dirty = (Object.keys(form) as (keyof ProfileValues)[]).some(
    (key) => form[key].trim() !== saved[key].trim(),
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrors({});

    startTransition(async () => {
      const toastId = toast.loading('Saving your details…');
      const result = await updateProfile(form);

      if (!result.ok) {
        setError(result.error ?? 'Could not save your details.');
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? 'Could not save your details.', { id: toastId });
        return;
      }

      setSaved(form);
      if (result.changed && result.changed.length > 0) {
        toast.success('Profile updated', {
          id: toastId,
          description: `${result.changed.length} detail${
            result.changed.length === 1 ? '' : 's'
          } saved.`,
        });
      } else {
        toast.success('Nothing to save', { id: toastId, description: 'Your details are current.' });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 px-5 py-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          value={form.firstName}
          onChange={(e) => set('firstName', e.target.value)}
          error={errors.firstName}
        />
        <TextField
          label="Middle name"
          name="middleName"
          autoComplete="additional-name"
          value={form.middleName}
          onChange={(e) => set('middleName', e.target.value)}
          error={errors.middleName}
        />
        <TextField
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          value={form.lastName}
          onChange={(e) => set('lastName', e.target.value)}
          error={errors.lastName}
        />
        <TextField
          label="Suffix"
          name="suffix"
          placeholder="Jr., Sr., III"
          autoComplete="honorific-suffix"
          value={form.suffix}
          onChange={(e) => set('suffix', e.target.value)}
          error={errors.suffix}
        />
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          required
          value={form.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
          error={errors.dateOfBirth}
        />

        <div>
          <label htmlFor="sex" className="block text-sm font-medium">
            Sex<span className="ml-0.5 text-rose-500">*</span>
          </label>
          <select
            id="sex"
            name="sex"
            required
            value={form.sex}
            onChange={(e) => set('sex', e.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            <option value="">Select…</option>
            {SEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors.sex ? (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.sex}</p>
          ) : null}
        </div>

        <TextField
          label="Mobile number"
          name="mobile"
          type="tel"
          autoComplete="tel"
          placeholder="0917 810 1001"
          required
          value={form.mobile}
          onChange={(e) => set('mobile', e.target.value)}
          error={errors.mobile}
        />

        <div>
          <span className="block text-sm font-medium">Email address</span>
          <p className="mt-1.5 truncate text-sm text-neutral-700 dark:text-neutral-300">{email}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Cannot be changed — your username was issued from it.
          </p>
        </div>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <div className="flex items-center gap-3">
        <div className="sm:max-w-xs">
          <SubmitButton busy={pending} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save changes'}
          </SubmitButton>
        </div>
        {dirty && !pending ? (
          <button
            type="button"
            onClick={() => {
              setForm(saved);
              setErrors({});
              setError(null);
            }}
            className="text-sm text-neutral-500 underline-offset-2 hover:underline"
          >
            Discard
          </button>
        ) : null}
      </div>
    </form>
  );
}
