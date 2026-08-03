import { headers } from 'next/headers';
import Image from 'next/image';
import { AppShell } from '@sfsr/ui';
import { getClientSession } from '@/lib/session';
import { navigationFor, publicNavItems } from '@/lib/navigation';
import { AccountBar } from './account-bar';
import { PublicShell } from './public-shell';

/**
 * Buyer-facing shell, in two forms.
 *
 * SIGNED OUT → `PublicShell`: a top bar, no sidebar. "Kapag hindi pa nakalogin
 * ang user alisin muna ang side bar." A visitor reading the brochure does not
 * need a 256px column of items they cannot use yet, and the landing hero was
 * drawn for the full width.
 *
 * SIGNED IN → `AppShell` with `variant="brand"`: the deep-green sidebar the
 * client asked for, with the reference screenshot as the target — white logo
 * plate, MAIN MENU, gold on the current page, tagline at the foot. This is the
 * "sa loob ng account ni buyer" half of the same instruction.
 *
 * The Internal Management System stays on the default neutral skin; this was
 * about the buyer's portal.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // One verified cookie read gives the tier AND the person's name, so the
  // header can greet them without touching Firestore.
  const session = await getClientSession();
  const tier = session?.tier ?? 'GUEST';

  const headerList = await headers();
  const currentPath = headerList.get('x-pathname') ?? '/';

  if (tier === 'GUEST') {
    return (
      <PublicShell items={publicNavItems()} currentPath={currentPath}>
        {children}
      </PublicShell>
    );
  }

  return (
    <AppShell
      variant="brand"
      brand="St. Francis Square Realty"
      subtitle="Client Portal"
      logo={
        <Image
          src="/logo.png"
          alt=""
          width={71}
          height={128}
          // The mark is a tall 71×128 glyph cropped to its ink, so height
          // drives the size and the width follows.
          className="h-9 w-auto shrink-0 object-contain"
          priority
        />
      }
      sections={navigationFor(tier)}
      currentPath={currentPath}
      topbar={
        <AccountBar
          tier={tier}
          displayName={session?.displayName}
          username={session?.username}
        />
      }
      footer={
        <div className="space-y-1.5 py-1">
          <p className="text-[11px] font-semibold uppercase leading-snug tracking-[0.08em] text-white/70">
            Building Landmarks.
            <br />
            Creating Futures.
          </p>
          <p className="text-[10px] text-white/40">
            © {new Date().getFullYear()} St. Francis Square Realty Corporation
          </p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
