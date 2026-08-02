import Link from 'next/link';
import { headers } from 'next/headers';
import { AppShell } from '@sfsr/ui';
import { getTier } from '@/lib/session';
import { navigationFor } from '@/lib/navigation';
import { SessionFooter } from './session-footer';

/**
 * Buyer-facing shell. Wraps public pages too — a Guest User browsing projects
 * sees the same sidebar, just with fewer items.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const tier = await getTier();
  const headerList = await headers();
  const currentPath = headerList.get('x-pathname') ?? '/';

  return (
    <AppShell
      brand="St. Francis Square Realty"
      subtitle="Client Portal"
      sections={navigationFor(tier)}
      currentPath={currentPath}
      LinkComponent={Link}
      footer={<SessionFooter tier={tier} />}
    >
      {children}
    </AppShell>
  );
}
