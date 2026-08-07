import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * The bell in the topbar, with the count of work waiting on this desk.
 *
 * The badge is drawn ONLY when there is something to show. A "0" bubble is a
 * notification that there are no notifications — it draws the eye every time
 * the page loads and rewards it with nothing.
 *
 * Gold rather than the sheet's red: red is the alarm colour in this system
 * (`Cancelled`, `Reject`, a failed verification), and a queue with work in it
 * is the normal state of a working department, not a fault.
 */
export function NotificationBell({ count, href }: { count: number; href: string | null }) {
  const label =
    count === 0
      ? 'Nothing waiting'
      : `${count} item${count === 1 ? '' : 's'} waiting in your queue`;

  const inner = (
    <>
      <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold leading-none text-navy-900 ring-2 ring-white"
        >
          {/* Past 99 the bubble stops being a number and starts being a shape. */}
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </>
  );

  const styles =
    'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-navy-700 transition-colors hover:bg-navy-50';

  return href ? (
    <Link href={href} className={styles} aria-label={label} title={label}>
      {inner}
    </Link>
  ) : (
    <span className={styles} aria-label={label} title={label} role="img">
      {inner}
    </span>
  );
}
