import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@sfsr/ui';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'St. Francis Square Realty',
    template: '%s | St. Francis Square Realty',
  },
  description:
    'Browse condominium units, schedule a site viewing, and reserve your property online.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read here rather than in the sidebar so the class is on <html> in the very
  // first byte of markup. Resolve it after paint and the sidebar would render
  // wide and then snap shut in front of the visitor.
  const collapsed = (await cookies()).get('sfsr-sidebar')?.value === 'collapsed';

  return (
    // suppressHydrationWarning is required: next-themes sets class="dark" on
    // <html> before React hydrates, so the server and client markup differ by
    // design on this element only.
    <html lang="en" className={collapsed ? 'sidebar-collapsed' : undefined} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* Light only — the approved buyer-facing design is a light one, and
            following the visitor's OS was repainting it near-black for anyone
            on dark Windows. The Internal system keeps the full picker. */}
        <ThemeProvider forced="light">{children}</ThemeProvider>

        {/*
         * Mounted in the ROOT layout, which is what makes a toast survive the
         * redirect that follows a sign-in. Next's client-side navigation swaps
         * the page below without remounting this, so a toast raised just
         * before `router.push` is still on screen when the destination paints.
         * Put it inside `(site)` instead and it would be destroyed mid-flight.
         *
         * BOTTOM-RIGHT, not top-centre. Centred at the top it sat directly on
         * the page heading — "My Reservations" was half-covered by the very
         * toast congratulating you on arriving there. Nothing lives in the
         * bottom-right corner of any page in this portal.
         *
         * `richColors` is off: it floods the toast with sonner's own green,
         * which is not #234b31 and reads as a different product. The palette
         * comes from globals.css instead.
         */}
        <Toaster
          position="bottom-right"
          closeButton
          theme="light"
          duration={5000}
        />
      </body>
    </html>
  );
}
