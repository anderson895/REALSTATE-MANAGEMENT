'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ProjectPlaceholder, cloudinaryUrl } from '@sfsr/ui';

/**
 * Horizontally scrolling project strip.
 *
 * Native scrolling with CSS snap points rather than a transform-driven slider:
 * that keeps keyboard, touch and trackpad behaviour for free, and the arrows
 * only have to nudge `scrollLeft`.
 *
 * The one reason this is a client island at all is those two arrow buttons.
 * The cards themselves are plain links and the images are already optimised by
 * the server, so what crosses the boundary is a small array of strings and
 * numbers — not a component tree.
 */

export interface CarouselProject {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly heroImageUrl: string | null;
  readonly startingAt: string | null;
}

export function ProjectCarousel({ projects }: { projects: readonly CarouselProject[] }) {
  const track = useRef<HTMLDivElement>(null);

  if (projects.length === 0) {
    return <p className="text-sm text-neutral-500">No projects are listed yet.</p>;
  }

  const arrow =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 ' +
    'bg-white text-xl leading-none text-brand-600 transition-colors hover:bg-brand-50';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={arrow}
        aria-label="Previous projects"
        onClick={() => track.current?.scrollBy({ left: -260, behavior: 'smooth' })}
      >
        &#8249;
      </button>

      {/* scrollbar-none keeps the strip clean; the arrows and native swipe are
          the affordances. */}
      {/* min-w-0: a flex item defaults to `min-width: auto`, which means this
          track would rather push its parent wider than scroll. Without it the
          `overflow-x-auto` above never engages. */}
      <div
        ref={track}
        className="scrollbar-none flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto pb-1"
      >
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="w-44 shrink-0 snap-start overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="relative h-28 bg-brand-50">
              {p.heroImageUrl ? (
                <Image
                  src={cloudinaryUrl(p.heroImageUrl, { width: 352, height: 224, crop: 'fill' })}
                  alt={p.name}
                  fill
                  sizes="176px"
                  className="object-cover"
                />
              ) : (
                <ProjectPlaceholder name={p.name} />
              )}
            </div>
            <div className="px-3 pb-3.5 pt-2.5">
              <strong className="block text-[0.85rem] leading-tight">{p.name}</strong>
              <p className="mb-2 mt-0.5 text-xs text-neutral-500">{p.location}</p>
              {p.startingAt ? (
                <>
                  <p className="text-[0.68rem] text-neutral-500">Price starts at</p>
                  <p className="tabular mt-0.5 text-lg font-bold text-brand-600">{p.startingAt}</p>
                </>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      <button
        type="button"
        className={arrow}
        aria-label="Next projects"
        onClick={() => track.current?.scrollBy({ left: 260, behavior: 'smooth' })}
      >
        &#8250;
      </button>
    </div>
  );
}
