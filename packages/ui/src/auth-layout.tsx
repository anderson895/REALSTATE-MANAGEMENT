import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cloudinaryUrl } from './cloudinary-image';
import { ThemeToggleCompact } from './theme';

/**
 * Split layout for the sign-in and registration pages.
 *
 * A bare form on a black page gives a buyer nothing to recognise. This puts an
 * actual project render beside the form — the same asset the browse pages use,
 * already on the Cloudinary CDN — so the page carries the developer's identity
 * at the moment someone is deciding whether to trust it with their details.
 *
 * The image panel is hidden below `lg`: on a phone it would push the form
 * below the fold, and signing in is the only job of this page.
 */
export function AuthLayout({
  heroPublicId,
  cloudName,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  /** e.g. `sfsr/projects/GVR004/hero`. Omit to render the gradient panel. */
  heroPublicId?: string;
  cloudName?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Registration has ~14 fields in a two-column grid; sign-in has two. */
  wide?: boolean;
}) {
  const heroUrl =
    heroPublicId && cloudName
      ? cloudinaryUrl(
          `https://res.cloudinary.com/${cloudName}/image/upload/${heroPublicId}`,
          { width: 1200, height: 1600, crop: 'fill' },
        )
      : null;

  return (
    <div className="flex min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <aside className="relative hidden w-[45%] max-w-2xl shrink-0 lg:block">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt=""
            fill
            sizes="45vw"
            className="object-cover"
            priority
            aria-hidden="true"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900" />
        )}
        {/* Legibility scrim — the renders are bright at the top and the
            wordmark has to stay readable over any of the four. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />

        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            St. Francis Square Realty
            <span className="mt-0.5 block text-xs font-normal text-white/60">
              Corporation
            </span>
          </Link>

          <div>
            <p className="text-2xl font-semibold leading-snug">
              Reserve your unit
              <br />
              online, in minutes.
            </p>
            <p className="mt-3 max-w-sm text-sm text-white/70">
              Browse 150 units across five condominium projects, schedule a site viewing, and track
              your reservation from application to Contract to Sell.
            </p>
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 items-center justify-center px-6 py-12">
        {/* These pages have no sidebar, so the theme picker would otherwise be
            unreachable until after sign-in. */}
        <ThemeToggleCompact className="absolute right-5 top-5" />

        <div className={wide ? 'w-full max-w-xl' : 'w-full max-w-sm'}>
          <Link
            href="/"
            className="mb-8 block text-sm font-semibold text-brand-700 lg:hidden dark:text-brand-300"
          >
            St. Francis Square Realty
          </Link>

          <p className="text-xs font-medium uppercase tracking-wider text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-sm text-neutral-500">{subtitle}</p>

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-6">{footer}</div> : null}

          <p className="mt-10 text-xs text-neutral-400">
            <Link href="/projects" className="hover:text-brand-600">
              Browse projects without an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
