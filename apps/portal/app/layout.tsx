import type { Metadata } from 'next';
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
