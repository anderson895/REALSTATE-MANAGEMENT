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
      media={
        // h-full, not a fixed height: the shell hands this panel whatever the
        // menu did not use, so the render grows to fill the sidebar instead of
        // leaving bare green above it.
        <div className="relative h-full w-full overflow-hidden">
          <Image
            src="/sidebar-tower.png"
            alt=""
            fill
            /*
             * 640px, NOT the 256px the panel is wide.
             *
             * `sizes` must describe how wide the IMAGE renders, not the box it
             * is clipped to. This source is landscape (1536×1024) in a roughly
             * 256×400 panel, so `object-cover` scales it to about 600px wide
             * and shows the middle slice. Asking for 256px meant the browser
             * was handed a 256px-wide picture and stretched it to 600 — a
             * 2.3× upscale, which is exactly what the blur was.
             */
            sizes="640px"
            className="object-cover"
            // The source is landscape (1536×1024) in a ~256px-wide panel, so
            // `object-cover` shows a narrow vertical slice at full height.
            // The tower sits right of centre; left at 50% the slice would
            // frame the car park in front of it instead.
            //
            // Inline rather than `object-[62%_center]` because this is a value
            // that wants nudging by eye, and a plain style property cannot be
            // silently dropped by a class scan the way an arbitrary utility in
            // a rarely-rendered branch can.
            style={{ objectPosition: '62% center' }}
          />
          {/*
           * The render is vignetted — its edges feather out to a pale grey.
           * Left alone on a deep-green panel that reads as a grey halo round
           * the photo, not a blend.
           *
           * Two short gradients at the ends rather than one full-height one:
           * a single green→transparent→green wash would dim the middle of the
           * image too, and the middle is the tower. These cover only the
           * bands where the vignette actually is.
           */}
          <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-brand-600 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-brand-600 to-transparent" />
        </div>
      }
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
