import { Suspense } from 'react';
import Image from 'next/image';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { Icon, type IconName } from './icons';

/**
 * The gold sweep, and the edge the photograph ends on.
 *
 * ── One curve, not two straight pieces ────────────────────────────────────
 *
 * Earlier passes drew a straight band across the bottom and hung a separate
 * ellipse against the right edge. In image.png they are the same stroke: it
 * enters low on the left, rises gently under the building, then hooks upward
 * along the right edge. Split into two, the right-hand piece reads as a stray
 * ring floating beside the card — which is exactly how it looked.
 *
 * Written in objectBoundingBox units (0–1) so one definition drives both the
 * clip and the stroke, and neither can drift from the other. `preserveAspect-
 * Ratio="none"` stretches the curve to the viewport; `non-scaling-stroke`
 * keeps the band an even thickness while it does, instead of squashing it
 * flat on a wide screen.
 *
 * Both ends run PAST the box — to -0.1 and 1.06, along the curve's own
 * tangents — so the stroke's flat end caps fall outside the SVG viewport and
 * get clipped. Ending them at exactly 0 and 1 left a visible square cut at
 * each edge, which is the one thing a sweep must not have.
 */
const SWEEP =
  'M-0.1,0.944 L0,0.93 C0.25,0.895 0.45,0.865 0.62,0.82 C0.82,0.765 0.95,0.63 1,0.44 L1.06,0.212';

/** Everything above the sweep. Same control points, closed across the top. */
const PHOTO_AREA =
  'M0,0 H1 V0.44 C0.95,0.63 0.82,0.765 0.62,0.82 C0.45,0.865 0.25,0.895 0,0.93 Z';

export const metadata: Metadata = { title: 'Employee Login' };

/**
 * Staff sign-in.
 *
 * ── Why this screen breaks the app's palette ──────────────────────────────
 *
 * This page is navy and gold, and so is everything behind it now.
 *
 * It used to be the exception: the note here read "everything past sign-in is
 * brand green ... the divergence is one screen wide". INTERNAL.xls sheet
 * `USER INTERFACE` then turned out to draw every internal screen in the same
 * navy and gold, so the door and the rooms match and the green stayed with the
 * buyer portal, where it belongs.
 *
 * The colours below are still literals rather than `--color-navy-*` tokens.
 * That is now only inertia rather than a reason — this screen predates the
 * ramp, and swapping them is a safe tidy-up nobody has needed yet.
 *
 * No theme toggle here either. The design is a photograph under a dark wash —
 * there is no light variant of it to switch to.
 */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#08183a]">
      {/* ── Backdrop ─────────────────────────────────────────────────── */}
      {/*
       * The clip path lives in the document rather than in CSS because
       * `clip-path: path()` takes absolute pixels, which would freeze the
       * curve at one viewport size. An SVG clipPath in objectBoundingBox units
       * scales with the element.
       */}
      <svg aria-hidden="true" className="absolute h-0 w-0" focusable="false">
        <defs>
          <clipPath id="login-photo" clipPathUnits="objectBoundingBox">
            <path d={PHOTO_AREA} />
          </clipPath>
        </defs>
      </svg>

      {/*
       * The photograph is CLIPPED along the sweep, not laid under the whole
       * page with a gold stripe painted over it.
       *
       * That is the difference between a band that sits on the image and one
       * the image ends at. Below the curve there is no photograph at all —
       * solid navy, which is what the footer type sits on and why it stays
       * legible without another dark wash.
       */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ clipPath: 'url(#login-photo)' }}
      >
        <Image
          src="/login-bg.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/*
         * Three light passes rather than one heavy one. The first attempt
         * stacked two ~85% washes and erased the photograph — the towers and
         * the lit plaza went flat navy, which is the one thing the image was
         * chosen for. Nothing here goes above ~70%.
         */}
        <div className="absolute inset-0 bg-[#0a1c40]/45 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08183a]/40 via-[#0a1c40]/15 to-[#08183a]/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08183a]/45 via-transparent to-[#08183a]/30" />
      </div>

      {/* The gold sweep, riding the exact edge the photograph ends on.
          Decorative, and the only thing on the page that is purely so. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="login-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b8942a" />
            <stop offset="45%" stopColor="#d8b955" />
            <stop offset="100%" stopColor="#c9a227" />
          </linearGradient>
        </defs>
        <path
          d={SWEEP}
          fill="none"
          stroke="url(#login-gold)"
          strokeWidth="15"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <main className="relative flex flex-1 items-center px-6 py-12">
        {/* Top-aligned on desktop, not centred. The brand block is much
            shorter than the card, and centring it dropped the lockup to the
            middle of the page while the card still started at the top —
            reading as two panels that had come unmoored from each other. */}
        {/*
         * The card's WIDTH is what sets this composition, not its position.
         *
         * At max-w-md it came out narrow enough to strand itself against the
         * right edge with a gulf between it and the heading — twice the gap the
         * reference has. Widening it to 540px closes that gap from the inside,
         * which is what the reference actually does: its card is 53% of the
         * page height wide, and this one now matches.
         *
         * Chasing the same thing by stretching the container only pushed the
         * card further right and buried the gold arc behind it.
         */}
        <div className="mx-auto grid w-full max-w-[1360px] items-center gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
          <BrandPanel />

          <div className="mx-auto w-full max-w-[540px] lg:mx-0 lg:ml-auto">
            <LoginCard />
          </div>
        </div>
      </main>

      {/* Sits lower than it did. The footer is pinned to the bottom of the
          column, so its own bottom padding is the only lever — trimming it
          opens the gap between the copyright and the sweep passing above. */}
      <footer className="relative pb-3 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-white/80">
          <Image src="/logo.png" alt="" width={71} height={128} className="h-5 w-auto" />
          <span className="font-medium">Version 1.0</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/50">
          © 2026 St. Francis Square Realty Corporation
          <br />
          All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}

function BrandPanel() {
  return (
    // Centred at every width, matching the mockup. Left-aligning it on desktop
    // pulled the wordmark away from the heading beneath it and the block
    // stopped reading as one lockup.
    <section className="text-center lg:pt-4">
      <div className="flex items-center justify-center gap-4">
        {/*
         * The Portal's mark, not the gold tower the reference shows.
         *
         * The layout is copied from the client's design; the logo is not part
         * of that. One mark across both apps is the point — a login screen
         * carrying a different glyph from the system behind it reads as a
         * different company.
         */}
        <Image
          src="/logo.png"
          alt=""
          width={71}
          height={128}
          priority
          className="h-16 w-auto shrink-0 object-contain"
        />
        <div className="text-left">
          <p className="text-3xl font-semibold uppercase leading-none tracking-[0.04em] text-white sm:text-4xl">
            St. Francis Square
          </p>
          <p className="mt-1.5 text-sm uppercase tracking-[0.3em] text-white/75 sm:text-base">
            Realty Corporation
          </p>
        </div>
      </div>

      <h1 className="mt-12 text-3xl font-bold uppercase leading-[1.15] tracking-wide text-[#e0c068] sm:text-[2.6rem]">
        Internal
        <br />
        Management System
      </h1>

      <div aria-hidden="true" className="mx-auto mt-6 h-px w-64 bg-[#c9a227]/70" />

      <p className="mt-5 text-xl text-white/90">Secure Employee Access Portal</p>

      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-lg text-white/90">
        <Feature name="shield" label="Secure" />
        <Dot />
        <Feature name="gear" label="Efficient" />
        <Dot />
        <Feature name="nodes" label="Integrated" />
      </ul>

      <p className="mt-4 text-xl text-white/85">Real Estate Management</p>
    </section>
  );
}

function Feature({ name, label }: { name: IconName; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Icon name={name} className="h-[22px] w-auto" />
      <span>{label}</span>
    </li>
  );
}

function Dot() {
  return (
    <li aria-hidden="true" className="text-[#c9a227]">
      •
    </li>
  );
}

function LoginCard() {
  return (
    // One panel, no glass frame around it. The translucent outer border was an
    // invention — the design is a single light card on the navy, and the extra
    // rim read as a second, competing edge.
    <div className="rounded-2xl bg-[#eef1f6]/95 px-6 py-6 shadow-2xl backdrop-blur-sm">
      <header className="mb-5 flex items-start gap-3.5">
        {/* The badge is one glyph in the client's set — navy disc and gold
            padlock together — so it does not need a circle drawn behind it. */}
        <Icon name="lock-badge" className="h-12 w-auto shrink-0" priority />
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold leading-tight text-[#12294f]">Employee Login</h2>
          <p className="mt-1 text-[13px] leading-snug text-neutral-500">
            Please sign in using your authorized company account.
          </p>
        </div>
      </header>

      {/* The form reads ?next= via useSearchParams, which opts the route
          into client rendering and therefore needs a boundary at build time. */}
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm />
      </Suspense>

      <hr className="my-4 border-[#c9a227]/40" />

      <section className="rounded-lg bg-white/70 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <Icon name="warning" className="h-6 w-auto" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-[#12294f]">Security Notice</h3>
            {/* Flex rows rather than "• " inline: a wrapped bullet hangs under
                the text, not back under the dot. */}
            <ul className="mt-1.5 space-y-1 text-[11.5px] leading-[1.45] text-neutral-600">
              {[
                'Only authorized employees are allowed to access this system.',
                'All login activities are monitored and recorded.',
                'Unauthorized access is strictly prohibited.',
              ].map((line) => (
                <li key={line} className="flex gap-1.5">
                  <span aria-hidden="true">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-16 animate-pulse rounded-md bg-neutral-100" />
      <div className="h-16 animate-pulse rounded-md bg-neutral-100" />
      <div className="h-12 animate-pulse rounded-md bg-neutral-100" />
    </div>
  );
}
