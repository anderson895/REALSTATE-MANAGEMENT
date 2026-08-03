'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  PASSWORD_REQUIREMENTS,
  SEX_OPTIONS,
  USERNAME_POLICY,
  validatePassword,
} from '@sfsr/domain';
import { toast } from 'sonner';
import { getClientAuth } from '@sfsr/infrastructure';
import { publicConfig } from '@sfsr/infrastructure';
import { Checkbox, FormError, SubmitButton, TextField, fieldClass } from '@sfsr/ui';
import { registrationSchema } from '@/lib/schemas/registration';
import { Recaptcha } from './recaptcha';

/**
 * Prospective buyer registration — the Registration Page in RESERVATION.doc.
 *
 * On success it signs the buyer straight in rather than bouncing them to the
 * login page: they have just typed the credentials, and a portal that asks for
 * them twice in ten seconds reads as broken.
 */

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  dateOfBirth: '',
  sex: '' as (typeof SEX_OPTIONS)[number] | '',
  mobile: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  recaptchaToken: '',
  certifyTruthful: false,
  acceptTerms: false,
  dataPrivacyConsent: false,
};

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  /** Clears the spent reCAPTCHA token so a retry gets a fresh one. */
  function resetCaptcha() {
    setCaptchaReset((n) => n + 1);
    setForm((prev) => ({ ...prev, recaptchaToken: '' }));
  }

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  // Live checklist rather than one error at a time — the policy has five
  // rules and revealing them one per submit is a miserable way to pick a
  // password.
  const unmet = useMemo(
    () => new Set(validatePassword(form.password).map((v) => v.rule)),
    [form.password],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registrationSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      setFormError('Please correct the highlighted fields.');
      return;
    }

    setBusy(true);
    // Raised only after validation passes — a spinner that appears and dies in
    // the same frame because a field was blank is just a flicker.
    const toastId = toast.loading('Creating your account…');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        email?: string;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!response.ok || !body.ok) {
        setErrors(body.fieldErrors ?? {});
        const message = body.error ?? 'Could not create your account.';
        setFormError(message);
        toast.error(message, { id: toastId });
        // The token was spent on this attempt whether it passed or not.
        // Leaving it in place would fail the retry as a duplicate.
        resetCaptcha();
        return;
      }

      // Sign in and hand the token to the session route, exactly as the
      // login page does.
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        body.email ?? form.email,
        form.password,
      );
      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      toast.success('Account created', {
        id: toastId,
        description: `Welcome, ${form.firstName}. You are signed in as @${form.username}.`,
        action: { label: 'Browse units', onClick: () => router.push('/units') },
      });

      router.push('/projects');
      router.refresh();
    } catch {
      resetCaptcha();
      const message = 'Could not create your account. Please try again.';
      setFormError(message);
      toast.error(message, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <section className="space-y-5">
        <SectionTitle>Personal information</SectionTitle>

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
              onChange={(e) => set('sex', e.target.value as (typeof SEX_OPTIONS)[number])}
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
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 810 1001"
            required
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
            error={errors.mobile}
          />
          <TextField
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
          />
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle>Account credentials</SectionTitle>

        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          required
          hint={USERNAME_POLICY.description}
          value={form.username}
          onChange={(e) => set('username', e.target.value)}
          error={errors.username}
        />

        <div>
          <TextField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password}
          />
          {/* One column on the narrowest phones. Two columns of "At least one
              number" cannot fit 320px, and a grid item will not shrink below
              its min-content — so the pair pushed the whole form 8px wide. */}
          <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
            {PASSWORD_REQUIREMENTS.map((requirement) => {
              const met = form.password.length > 0 && !unmet.has(requirement.rule);
              return (
                <li
                  key={requirement.rule}
                  className={`flex items-center gap-1.5 text-xs ${
                    met ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-400'
                  }`}
                >
                  <span aria-hidden="true">{met ? '✓' : '○'}</span>
                  {requirement.label}
                </li>
              );
            })}
          </ul>
        </div>

        <TextField
          label="Confirm password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword', e.target.value)}
          error={errors.confirmPassword}
        />

        <Checkbox
          label="Show password"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle>Verification and consent</SectionTitle>

        {/*
         * reCAPTCHA renders a FIXED 304px iframe that cannot be made narrower.
         * On a 320px phone the page's own 24px gutters leave 272px, so the
         * widget pushed the whole document 8px wide.
         *
         * Scrolling it inside its own box rather than scaling it down: a CSS
         * transform on an ancestor of the widget creates a new containing
         * block for fixed-position elements, which is what reCAPTCHA's
         * challenge overlay uses — the puzzle would open in the wrong place,
         * or off-screen. A few pixels of scroll on the narrowest phones is the
         * cheaper trade.
         */}
        <div className="overflow-x-auto">
        <Recaptcha
          siteKey={publicConfig.recaptcha.siteKey}
          onChange={(token) => set('recaptchaToken', token ?? '')}
          error={errors.recaptchaToken}
          resetKey={captchaReset}
        />
        </div>

        <ConsentRow error={errors.certifyTruthful}>
          <Checkbox
            label="I certify that the information provided is true and correct."
            checked={form.certifyTruthful}
            onChange={(e) => set('certifyTruthful', e.target.checked)}
          />
        </ConsentRow>

        <ConsentRow error={errors.acceptTerms}>
          <Checkbox
            label={
              <span>
                I have read and agree to the{' '}
                <Link href="/terms" className="text-brand-600 hover:underline">
                  Terms and Conditions
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-brand-600 hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            }
            checked={form.acceptTerms}
            onChange={(e) => set('acceptTerms', e.target.checked)}
          />
        </ConsentRow>

        <ConsentRow error={errors.dataPrivacyConsent}>
          <Checkbox
            label="I authorize St. Francis Square Realty Corporation to collect and process my personal information in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) for reservation processing and other legitimate business purposes."
            checked={form.dataPrivacyConsent}
            onChange={(e) => set('dataPrivacyConsent', e.target.checked)}
          />
        </ConsentRow>
      </section>

      {formError ? <FormError>{formError}</FormError> : null}

      <div className="flex gap-3">
        <SubmitButton busy={busy}>{busy ? 'Creating account…' : 'Create Account'}</SubmitButton>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setErrors({});
            setFormError(null);
          }}
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Clear
        </button>
      </div>
    </form>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-neutral-200 pb-2 text-sm font-semibold dark:border-neutral-800">
      {children}
    </h2>
  );
}

function ConsentRow({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <div className={error ? 'rounded-md bg-rose-50 p-2 dark:bg-rose-950/40' : undefined}>
      <div className="[&_label]:items-start [&_input]:mt-0.5">{children}</div>
      {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
