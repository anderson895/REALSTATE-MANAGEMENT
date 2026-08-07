import type { Metadata } from 'next';
import { ThemeProvider } from '@sfsr/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'SFSR Internal Management System',
  description: 'St. Francis Square Realty Corporation — internal operations.',
  // This build runs on the office LAN and must never be indexed if it is
  // ever exposed by mistake (Development Plan.md §5.7).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is still required even though the theme is
    // pinned: next-themes writes the resolved class onto <html> from a blocking
    // script before React hydrates, so the server and client markup differ by
    // design on this element. The Portal pins a theme too and keeps this for
    // the same reason.
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/*
         * Pinned light — there is no theme mode in this app any more.
         *
         * INTERNAL.xls sheet `USER INTERFACE` draws one treatment: navy
         * sidebar, light content. There was no dark version of it to switch
         * to, so the picker offered a choice the design could not honour, and
         * the old `system` default silently repainted the whole system in
         * near-black for the majority of staff whose Windows is set to dark.
         *
         * `forced` rather than deleting the provider outright: `ThemeToggle`
         * and `ThemeToggleCompact` already return null when a theme is pinned,
         * so the shared mobile drawer loses its picker with nothing threaded
         * through the shell to switch it off. The Portal does the same thing
         * for the same reason.
         */}
        <ThemeProvider forced="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
