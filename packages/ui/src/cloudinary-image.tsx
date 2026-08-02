import { cn } from './cn';

/**
 * Cloudinary delivery helpers.
 *
 * The source PNGs are 1.4–2.5 MB each. Serving them raw would push ~33 MB at a
 * buyer browsing five projects, so every URL is rewritten with `f_auto,q_auto`
 * (WebP/AVIF where supported, automatic quality) and a width cap. The originals
 * stay untouched in Cloudinary; only delivery is transformed.
 */

export interface TransformOptions {
  readonly width?: number;
  readonly height?: number;
  /** `fill` crops to the box; `fit` letterboxes inside it. */
  readonly crop?: 'fill' | 'fit';
}

export function cloudinaryUrl(url: string, options: TransformOptions = {}): string {
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url; // not a Cloudinary URL — leave it alone

  const parts = ['f_auto', 'q_auto'];
  if (options.width) parts.push(`w_${options.width}`);
  if (options.height) parts.push(`h_${options.height}`);
  if (options.crop) parts.push(`c_${options.crop}`);

  return `${url.slice(0, at + marker.length)}${parts.join(',')}/${url.slice(at + marker.length)}`;
}

/**
 * Stand-in for a project with no hero render — currently only The Legaspi
 * Place (Development Plan.md §12.10).
 *
 * A plain empty box reads as a broken page. A branded panel carrying the
 * project's initials reads as "render not published yet", which is the truth.
 * The distinction matters on a page whose job is to make a buyer trust the
 * developer enough to part with ₱6,000,000.
 */
export function ProjectPlaceholder({ name }: { name: string }) {
  const initials = name
    .replace(/^The\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900">
      <span className="text-3xl font-semibold tracking-wide text-white/85">{initials}</span>
      <span className="text-[11px] uppercase tracking-widest text-white/50">
        Render coming soon
      </span>
    </div>
  );
}

/**
 * Placeholder for the 44 units that have no floor plan (Development Plan.md
 * §12.11). A missing asset should read as "not published yet", not as a broken
 * page — a buyer looking at a ₱39M penthouse should not see a broken image.
 */
export function MissingAsset({
  label,
  detail,
  className,
}: {
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900',
        className,
      )}
    >
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      {detail ? <p className="max-w-xs text-xs text-neutral-400">{detail}</p> : null}
    </div>
  );
}
