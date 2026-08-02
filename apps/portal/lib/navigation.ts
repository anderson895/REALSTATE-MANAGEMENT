import { clientCan, type ClientCapability, type ClientTier } from '@sfsr/domain';
import type { NavSection } from '@sfsr/ui';

/**
 * Buyer portal navigation.
 *
 * Rendered as a SIDEBAR — an explicit client instruction:
 * "Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid.
 *  Mas neat kasi tignan. Para nasa isang side lang. gaya sa picture."
 *
 * Items are filtered by the tier's capabilities, so the three account levels
 * in RESERVATION.doc — Guest, Initial, Permanent — each see a different menu
 * without a separate hand-written list per tier.
 */

interface Entry {
  readonly href: string;
  readonly label: string;
  readonly group: string;
  /** Always shown when absent. */
  readonly requires?: ClientCapability;
}

const ENTRIES: readonly Entry[] = [
  { href: '/', label: 'Home', group: 'Browse' },
  { href: '/projects', label: 'Condominium Projects', group: 'Browse', requires: 'browseProjects' },
  { href: '/compute', label: 'Sample Computation', group: 'Browse' },

  { href: '/tripping', label: 'Request Site Viewing', group: 'My Transactions', requires: 'requestTripping' },
  { href: '/dashboard/reservations', label: 'My Reservations', group: 'My Transactions', requires: 'reserveUnit' },
  { href: '/dashboard/documents', label: 'My Documents', group: 'My Transactions', requires: 'uploadDocuments' },

  { href: '/dashboard/soa', label: 'Statement of Account', group: 'My Account', requires: 'viewOwnSoa' },
  { href: '/dashboard/payments', label: 'Payment History', group: 'My Account', requires: 'viewOwnPayments' },
  { href: '/dashboard/profile', label: 'My Profile', group: 'My Account', requires: 'viewOwnProfile' },
];

const GROUP_ORDER = ['Browse', 'My Transactions', 'My Account'] as const;

export function navigationFor(tier: ClientTier): NavSection[] {
  const visible = ENTRIES.filter((e) => !e.requires || clientCan(tier, e.requires));

  return GROUP_ORDER.map((group) => ({
    title: group,
    items: visible.filter((e) => e.group === group).map((e) => ({ href: e.href, label: e.label })),
  })).filter((section) => section.items.length > 0);
}
