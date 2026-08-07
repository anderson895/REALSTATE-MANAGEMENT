import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Form primitives shared by both apps.
 *
 * Defined once so the reservation wizard, the login pages and the internal
 * screens cannot drift into three different-looking sets of inputs — the
 * eight-step wizard alone has around forty fields.
 */

/**
 * `dark:border-neutral-600`, not 700: a 700 border against an 800 field is
 * almost the same value, so the input has no visible edge on a dark screen and
 * the form reads as floating text with no boxes.
 */
export const fieldClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 ' +
  'outline-none transition-colors placeholder:text-neutral-400 ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  /** Beside the label, above the field — e.g. a "Forgot password?" link. */
  readonly trailing?: ReactNode;
  /** Decorative icon inside the field, on the left. Never focusable. */
  readonly leading?: ReactNode;
  /**
   * Interactive control inside the field, on the right — a show/hide toggle,
   * a clear button. Distinct from `trailing`, which sits outside the box and
   * is read as part of the label rather than as part of the input.
   */
  readonly inlineAction?: ReactNode;
  /**
   * Show the red asterisk on a required field. On by default.
   *
   * Turned off where EVERY field in the form is required — the sign-in screen,
   * for one. A marker that appears on all of them distinguishes nothing and
   * only adds punctuation to the label.
   */
  readonly showRequiredMarker?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  trailing,
  leading,
  inlineAction,
  showRequiredMarker = true,
  id,
  className,
  ...props
}: TextFieldProps) {
  const inputId = id ?? props.name;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
          {props.required && showRequiredMarker ? (
            <span className="ml-0.5 text-rose-500">*</span>
          ) : null}
        </label>
        {trailing}
      </div>

      <div className="relative mt-1.5">
        {leading ? (
          // pointer-events-none so a click on the icon still focuses the input
          // rather than landing on a dead span beside it.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-neutral-400"
          >
            {leading}
          </span>
        ) : null}

        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            fieldClass,
            leading && 'pl-10',
            inlineAction && 'pr-10',
            error && 'border-rose-400 focus:border-rose-500',
            className,
          )}
          {...props}
        />

        {inlineAction ? (
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2">{inlineAction}</span>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
      <input
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 dark:border-neutral-600',
          className,
        )}
        {...props}
      />
      {label}
    </label>
  );
}

export function SubmitButton({
  busy,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white',
        'transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {busy ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {children}
    </p>
  );
}
