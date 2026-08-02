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
    // suppressHydrationWarning is required: next-themes sets class="dark" on
    // <html> before React hydrates, so the server and client markup differ by
    // design on this element only.
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
