import Link from 'next/link';
import type { Metadata } from 'next';
import { publicConfig } from '@sfsr/infrastructure';
import { AuthLayout } from '@sfsr/ui';
import { ForgotUsernameForm } from './forgot-username-form';

export const metadata: Metadata = { title: 'Forgot Username' };

/**
 * Username recovery, asked for in comments.doc.
 *
 * A route of its own rather than a third stage on /reset-password, because the
 * two answer different questions and someone who has forgotten their username
 * usually still knows their password. Folding them together would make every
 * such person walk through a password reset they did not need — and end up
 * with a changed password they now have to remember as well.
 */
export default function ForgotUsernamePage() {
  return (
    <AuthLayout
      heroPublicId="sfsr/projects/EPR002/hero"
      cloudName={publicConfig.cloudinary.cloudName}
      eyebrow="Account Recovery"
      title="Find your username"
      subtitle="Enter the email address on your account and we will send your username to it."
      footer={
        <p className="text-sm text-neutral-500">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to Sign In
          </Link>
        </p>
      }
    >
      <ForgotUsernameForm />
    </AuthLayout>
  );
}
