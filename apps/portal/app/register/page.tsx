import Link from 'next/link';
import type { Metadata } from 'next';
import { publicConfig } from '@sfsr/infrastructure';
import { AuthLayout } from '@sfsr/ui';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create Your Account',
  description:
    'Create an account to schedule a site viewing, reserve your preferred property, and monitor your transactions online.',
};

export default function RegisterPage() {
  return (
    <AuthLayout
      heroPublicId="sfsr/projects/HPR004/hero"
      cloudName={publicConfig.cloudinary.cloudName}
      eyebrow="Create Your Account"
      title="Welcome to the SFSR Portal"
      // Wording taken from the Registration Page in RESERVATION.doc.
      subtitle="Create an account to schedule a site viewing, reserve your preferred property, and monitor your transactions online."
      wide
      footer={
        <p className="text-sm text-neutral-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Sign In
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
