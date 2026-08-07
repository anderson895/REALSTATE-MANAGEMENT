import { Ban, CalendarCheck2, Inbox, MapPin, type LucideIcon } from 'lucide-react';

/**
 * The counter strip across the top of the Tripping Schedule.
 *
 * INTERNAL.xls sheet `USER INTERFACE` opens every dashboard with a row of
 * these: a filled glyph square, the figure, the label under it. Kept in its
 * own file rather than inline in the page so the four cards are defined once,
 * beside the icons only they use.
 */

/**
 * The tone is passed as a key rather than as class names from the caller, so
 * the four cards cannot drift into four slightly different treatments — the
 * same reason `SHELL_STYLES` exists for the sidebar. It also keeps every
 * class name a literal, which is what lets Tailwind find them.
 */
const STAT_TONES = {
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  navy: 'bg-navy-800',
  rose: 'bg-rose-500',
} as const;

export type StatTone = keyof typeof STAT_TONES;

export function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: StatTone;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5 shadow-sm">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${STAT_TONES[tone]}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="tabular text-2xl font-bold leading-none text-navy-800">{value}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

/*
 * Aliased to what the counter MEANS rather than used under lucide's own names.
 * "Visited" is a map pin on this screen and would be something else on another,
 * and the page should not have to know which lucide glyph that is.
 */
export const UnclaimedIcon = Inbox;
export const AcceptedIcon = CalendarCheck2;
export const VisitedIcon = MapPin;
export const CancelledIcon = Ban;
