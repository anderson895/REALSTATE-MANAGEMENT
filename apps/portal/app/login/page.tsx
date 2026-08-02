import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { publicConfig } from '@sfsr/infrastructure';
import { AuthLayout } from '@sfsr/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <AuthLayout
      // Grand Verdant's render is portrait, which suits a tall side panel.
      // Served straight from the CDN, so this costs no Firestore reads.
      heroPublicId="sfsr/projects/GVR004/hero"
      cloudName={publicConfig.cloudinary.cloudName}
      eyebrow="Client Portal"
      title="Welcome back"
      subtitle="Sign in to track your reservation, documents, and payments."
      footer={
        <p className="text-sm text-neutral-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Create an Account
          </Link>
        </p>
      }
    >
      {/* The form reads ?next= via useSearchParams, which opts the route into
          client rendering and therefore needs a boundary at build time. */}
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
    </AuthLayout>
  );
}
