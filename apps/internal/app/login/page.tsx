import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ThemeToggleCompact } from '@sfsr/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

/**
 * Staff sign-in.
 *
 * Deliberately plainer than the Portal's split layout with a project render.
 * This is an intranet tool reached from a bookmark on an office LAN, not a
 * page that has to sell anything — and the marketing imagery would be a
 * distraction on a screen someone opens forty times a day.
 */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12 dark:bg-neutral-950">
      <ThemeToggleCompact className="absolute right-5 top-5" />

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
            SFSR
          </div>
          <h1 className="text-lg font-semibold">St. Francis Square Realty</h1>
          <p className="mt-1 text-sm text-neutral-500">Internal Management System</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {/* The form reads ?next= via useSearchParams, which opts the route
              into client rendering and therefore needs a boundary at build time. */}
          <Suspense
            fallback={
              <div className="space-y-5">
                <div className="h-16 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-16 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-10 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Authorised personnel only. All activity is recorded in the audit trail.
        </p>
      </div>
    </div>
  );
}
