'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getClientAuth } from '@sfsr/infrastructure';
import { ThemeToggle } from '@sfsr/ui';

export function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    // Clear both sides: the Firebase client session and our httpOnly cookie.
    await signOut(getClientAuth()).catch(() => undefined);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <ThemeToggle />
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Sign out
      </button>
    </div>
  );
}
