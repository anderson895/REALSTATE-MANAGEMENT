import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-brand-700 dark:text-brand-300">Welcome Back!</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to access your Client Portal.</p>
        </div>

        <Suspense
          fallback={
            <div className="h-80 animate-pulse rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
          }
        >
          <LoginForm />
        </Suspense>

        <div className="mt-4 space-y-1 text-center text-sm">
          <p>
            <Link href="/reset-password" className="text-brand-600 hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="text-neutral-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-brand-600 hover:underline">
              Create an Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
