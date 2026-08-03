import Link from 'next/link';
import { getCachedProjects } from '@/lib/catalog';
import { formatShort } from '@/lib/format';
import { ProjectCarousel } from './project-carousel';

/**
 * Public landing page.
 *
 * Every figure here — unit counts, starting prices, unit types, project names
 * — is read live from Firestore rather than hard-coded. A brochure page that
 * claims "150 available units" while the inventory says otherwise is worse
 * than no page at all, and this one cannot drift out of date.
 *
 * Stays a Server Component. The search bar is a plain GET form pointed at
 * `/units`, so filtering needs no client state, works with JavaScript off, and
 * produces a shareable URL. Only the featured-projects arrows are an island.
 */

export default async function HomePage() {
  // COST: 5 reads on a cache miss, 0 on a hit. Counts and unit types come from
  // the denormalised `stats` field, not from scanning 150 unit documents.
  const projects = await getCachedProjects();

  const totalAvailable = projects.reduce((sum, p) => sum + p.stats.availableUnits, 0);

  const prices = projects
    .map((p) => p.stats.minPriceCentavos)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : null;

  const unitTypes = [...new Set(projects.flatMap((p) => p.stats.unitTypes))].sort();

  return (
    <div className="pb-12">
      {/* ─────────────────────────────────────────────────────────── hero ── */}
      <section
        className="bg-[linear-gradient(rgba(23,51,31,0.62),rgba(23,51,31,0.42)),url('/hero.jpg')] bg-cover bg-center px-6 pb-24 pt-14 text-white"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-10 lg:flex-row">
          <div className="max-w-lg pt-4">
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.1] tracking-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.35)]">
              Find Your Perfect Home.
            </h1>
            <p className="mb-8 mt-4 max-w-[34ch] leading-relaxed [text-shadow:0_1px_8px_rgba(0,0,0,0.4)]">
              Explore our quality condominium projects and reserve your dream unit online.
            </p>
            <div className="flex flex-wrap gap-3.5">
              <Link
                href="/projects"
                className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
              >
                Browse Projects
              </Link>
              {/* Opaque, not translucent: a bordered ghost button vanishes
                  against the bright sky in the photograph. */}
              <Link
                href="/tripping"
                className="flex items-center gap-2 rounded-md bg-white/95 px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                Schedule Tripping
              </Link>
            </div>
          </div>

          <aside className="w-full shrink-0 rounded-xl bg-white/95 p-6 text-neutral-900 shadow-2xl lg:w-80">
            <h2 className="mb-4 text-base font-semibold">Why Choose Us?</h2>
            <ul className="grid gap-4">
              {WHY_US.map(({ icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-brand-600">
                    <FeatureIcon path={icon} />
                  </span>
                  <div>
                    <strong className="block text-[0.88rem]">{title}</strong>
                    <p className="mt-0.5 text-xs leading-snug text-neutral-500">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {/* ── search ── Pulled up over the hero's lower edge, per the design. */}
      <form
        action="/units"
        className="relative z-10 mx-auto -mt-12 flex w-[calc(100%-3rem)] max-w-6xl flex-wrap items-center gap-3 rounded-xl bg-brand-600 px-5 py-4 shadow-xl"
      >
        <span className="pr-2 font-semibold text-white">Find Your Ideal Unit</span>

        <select
          name="project"
          aria-label="Project"
          className="min-w-36 flex-1 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm text-neutral-900"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          name="type"
          aria-label="Unit type"
          className="min-w-36 flex-1 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm text-neutral-900"
        >
          <option value="">Unit Type</option>
          {unitTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          type="number"
          name="min"
          min="0"
          placeholder="Min. Price"
          aria-label="Minimum price"
          className="min-w-36 flex-1 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm text-neutral-900"
        />
        <input
          type="number"
          name="max"
          min="0"
          placeholder="Max. Price"
          aria-label="Maximum price"
          className="min-w-36 flex-1 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm text-neutral-900"
        />

        {/* The one warm accent on the page. */}
        <button
          type="submit"
          className="shrink-0 rounded-md bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-400"
        >
          Search Units
        </button>
      </form>

      {totalAvailable > 0 ? (
        <p className="mx-auto mt-4 w-[calc(100%-3rem)] max-w-6xl text-sm text-neutral-500">
          <strong className="text-brand-600">{totalAvailable}</strong> units available today
          {startingPrice !== null ? (
            <>
              {' '}
              &middot; starting at{' '}
              <strong className="text-brand-600">{formatShort(startingPrice)}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      {/* ─────────────────────────────────────── steps + featured split ── */}
      {/*
       * `minmax(0,…)`, not a bare `5fr_7fr`.
       *
       * An `fr` track is really `minmax(auto, Nfr)`, so it can never shrink
       * below its own min-content. The carousel's five 176px cards give the
       * right column a ~900px floor, and grid paid for it out of the left one:
       * the steps collapsed to a ~130px ribbon with all four labels overlapping
       * each other. Flooring both tracks at 0 lets the carousel do what it was
       * already built to do — scroll — instead of shoving its neighbour.
       */}
      <div className="mx-auto grid w-[calc(100%-3rem)] max-w-6xl items-start gap-10 py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/*
         * `min-w-0` on BOTH sections.
         *
         * A grid item defaults to `min-width: auto`, so it refuses to shrink
         * below its own min-content. The carousel already had `min-w-0` and
         * `overflow-x-auto`, but that only frees the track — it cannot help
         * while an ancestor is pinned open. The section held itself at 1024px
         * (five 176px cards plus gaps and arrows) and pushed the whole page
         * 649px past a 399px phone.
         */}
        <section className="min-w-0">
          <h2 className="mb-6 text-xl font-semibold">Simple Steps to Reserve</h2>
          {/* Four across only at `xl`. Between `lg` and `xl` the left track is
              ~400px, and four columns of 88px turn "Submit Requirements" into
              a stack of one-word lines. 2×2 reads better at that width. */}
          <ol className="grid grid-cols-2 gap-4 text-center xl:grid-cols-4">
            {STEPS.map(({ icon, title, body }, index) => (
              <li key={title} className="flex flex-col items-center">
                <span className="relative mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <FeatureIcon path={icon} size={24} />
                  <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[0.72rem] font-bold text-white">
                    {index + 1}
                  </span>
                </span>
                <strong className="text-[0.82rem] leading-tight">{title}</strong>
                <p className="mt-1 text-xs leading-snug text-neutral-500">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="min-w-0">
          <header className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold">Featured Projects</h2>
            <Link
              href="/projects"
              className="whitespace-nowrap text-sm font-semibold text-brand-600 hover:text-accent-500"
            >
              View All Projects &rarr;
            </Link>
          </header>
          <ProjectCarousel
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              location: p.location,
              heroImageUrl: p.heroImageUrl,
              startingAt: p.stats.minPriceCentavos
                ? formatShort(p.stats.minPriceCentavos)
                : null,
            }))}
          />
        </section>
      </div>

      {/* ───────────────────────────────────────────── assurance strip ── */}
      <section className="mx-auto grid w-[calc(100%-3rem)] max-w-6xl gap-5 rounded-xl border border-neutral-200 bg-white px-6 py-5 sm:grid-cols-2">
        {ASSURANCES.map(({ icon, title, body }) => (
          <div key={title} className="flex items-center gap-3.5">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FeatureIcon path={icon} size={20} />
            </span>
            <div>
              <strong className="text-sm">{title}</strong>
              <p className="mt-0.5 text-xs text-neutral-500">{body}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * Plain SVG rather than emoji.
 *
 * Emoji render as a different glyph on every platform — and in colour, which
 * fights the palette instead of inheriting it. These take `currentColor`, so
 * the parent's text colour controls them all.
 */
function FeatureIcon({ path, size = 18 }: { path: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

interface Feature {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}

const WHY_US: readonly Feature[] = [
  {
    icon: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    title: 'Prime Locations',
    body: 'Strategically located in key business and lifestyle districts.',
  },
  {
    icon: (
      <>
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
        <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
      </>
    ),
    title: 'Quality Living',
    body: 'Thoughtfully designed spaces for your comfort and lifestyle.',
  },
  {
    icon: (
      <>
        <path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.9 7.5 10 4.3-1.1 7.5-5.4 7.5-10v-6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    title: 'Secure & Reliable',
    body: 'Safe transactions and secure document management.',
  },
  {
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V20h13V9.5" />
        <path d="M9.75 20v-5.5h4.5V20" />
      </>
    ),
    title: 'Easy & Convenient',
    body: 'Reserve online and track your application anytime, anywhere.',
  },
];

const STEPS: readonly Feature[] = [
  {
    icon: (
      <>
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3 20.5a7 7 0 0 1 12-4.9" />
        <path d="M18 14v6M15 17h6" />
      </>
    ),
    title: 'Create an Account',
    body: 'Register to get started with your reservation.',
  },
  {
    icon: (
      <>
        <rect x="3.5" y="3" width="10" height="18" rx="1.2" />
        <path d="M13.5 9H20a.5.5 0 0 1 .5.5V21" />
        <path d="M6.75 6.75h3.5M6.75 10.25h3.5M6.75 13.75h3.5" />
      </>
    ),
    title: 'Choose a Unit',
    body: 'Browse available units and select your preferred one.',
  },
  {
    icon: (
      <>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </>
    ),
    title: 'Submit Requirements',
    body: 'Upload your documents and proof of payment online.',
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </>
    ),
    title: 'Track & Update',
    body: 'Monitor your reservation status in real time.',
  },
];

const ASSURANCES: readonly Feature[] = [
  {
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    title: 'Real-time Availability',
    body: 'Check unit availability the moment it changes.',
  },
  {
    icon: (
      <>
        <path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.9 7.5 10 4.3-1.1 7.5-5.4 7.5-10v-6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    title: 'Secure Document Upload',
    body: 'Your documents are validated on upload and kept private.',
  },
];
