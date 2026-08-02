import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-brand-700 dark:text-brand-300">
            St. Francis Square Realty
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Internal Management System</p>
        </div>

        {/* The form reads ?next= via useSearchParams, which opts the route into
            client rendering and therefore needs a boundary at build time. */}
        <Suspense
          fallback={
            <div className="h-72 animate-pulse rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
          }
        >
          <LoginForm />
        </Suspense>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Authorised personnel only. All activity is recorded in the audit trail.
        </p>
      </div>
    </div>
  );
}
