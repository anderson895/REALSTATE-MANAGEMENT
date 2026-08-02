'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';
import type { ClientTier } from '@sfsr/domain';

const TIER_LABEL: Record<ClientTier, string> = {
  GUEST: 'Browsing as guest',
  INITIAL: 'Initial Account',
  PERMANENT: 'Permanent Client',
};

export function SessionFooter({ tier }: { tier: ClientTier }) {
  const router = useRouter();

  if (tier === 'GUEST') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-500">{TIER_LABEL.GUEST}</p>
        <Link
          href="/login"
          className="block rounded-md bg-brand-600 px-2.5 py-1.5 text-center text-xs font-medium text-white hover:bg-brand-700"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="block rounded-md border border-neutral-300 px-2.5 py-1.5 text-center text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Create an Account
        </Link>
      </div>
    );
  }

  async function onSignOut() {
    await signOut(getClientAuth()).catch(() => undefined);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {TIER_LABEL[tier]}
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Sign out
      </button>
    </div>
  );
}
