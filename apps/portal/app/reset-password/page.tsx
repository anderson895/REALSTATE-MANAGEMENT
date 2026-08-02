import Link from 'next/link';
import type { Metadata } from 'next';
import { publicConfig } from '@sfsr/infrastructure';
import { AuthLayout } from '@sfsr/ui';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Reset Password' };

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      heroPublicId="sfsr/projects/EPR002/hero"
      cloudName={publicConfig.cloudinary.cloudName}
      eyebrow="Account Recovery"
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a reset link."
      footer={
        <p className="text-sm text-neutral-500">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to Sign In
          </Link>
        </p>
      }
    >
      <ResetForm />
    </AuthLayout>
  );
}
