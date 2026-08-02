import type { Metadata } from 'next';
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
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
