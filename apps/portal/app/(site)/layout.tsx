import { headers } from 'next/headers';
import { AppShell } from '@sfsr/ui';
import { getClientSession } from '@/lib/session';
import { navigationFor } from '@/lib/navigation';
import { SessionFooter } from './session-footer';

/**
 * Buyer-facing shell. Wraps public pages too — a Guest User browsing projects
 * sees the same sidebar, just with fewer items.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // One verified cookie read gives the tier AND the person's name, so the
  // sidebar can greet them without touching Firestore.
  const session = await getClientSession();
  const tier = session?.tier ?? 'GUEST';

  const headerList = await headers();
  const currentPath = headerList.get('x-pathname') ?? '/';

  return (
    <AppShell
      brand="St. Francis Square Realty"
      subtitle="Client Portal"
      sections={navigationFor(tier)}
      currentPath={currentPath}
      footer={
        <SessionFooter
          tier={tier}
          displayName={session?.displayName}
          username={session?.username}
        />
      }
    >
      {children}
    </AppShell>
  );
}
