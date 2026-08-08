import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import type { AnnouncementRow } from '@sfsr/infrastructure/server';
import { cn } from '@sfsr/ui';

/**
 * What Marketing has posted, on the dashboard.
 *
 * ── Why this one panel is NOT gated ──────────────────────────────────────
 *
 * Everything else on the dashboard is behind the grant that owns it. This is
 * not, and deliberately: an announcement is a notice to all staff, the
 * `announcements` collection is world-readable in the Security Rules — it is
 * meant to reach buyers on the Portal eventually — and a company notice nobody
 * is shown is not a notice.
 *
 * ADVERTISEMENT gates WRITING one, which is Marketing's alone. Reading is the
 * point of publishing.
 */
export function AnnouncementsPanel({
  announcements,
  className,
}: {
  announcements: readonly AnnouncementRow[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          Announcements
        </h2>
        <Link
          href="/announcements"
          className="text-[11px] font-semibold text-navy-600 hover:underline"
        >
          View all
        </Link>
      </header>

      {announcements.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Megaphone
            className="mx-auto mb-2 h-6 w-6 text-neutral-300"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-navy-800">Nothing posted yet</p>
          <p className="mt-1 text-xs text-neutral-500">
            Marketing posts project news and promotions here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="flex gap-3 px-5 py-3.5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"
              >
                <Megaphone className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {announcement.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                  {announcement.body}
                </p>
              </div>
              {/* Rendered on the server from a stored timestamp, so it is a
                  DATE and not a live "2h ago" that would need a ticker on a
                  panel nobody watches. */}
              <span className="shrink-0 text-[10px] text-neutral-400">
                {shortDate(announcement.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
}
