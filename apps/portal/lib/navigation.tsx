import { clientCan, type ClientCapability, type ClientTier } from '@sfsr/domain';
import type { NavSection } from '@sfsr/ui';
import { NavIcon, type NavIconName } from './nav-icons';

/**
 * Buyer portal navigation.
 *
 * Signed in, this is rendered as a SIDEBAR — an explicit client instruction:
 * "Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid.
 *  Mas neat kasi tignan. Para nasa isang side lang. gaya sa picture."
 *
 * ONE group, "MAIN MENU", following the picture that came with that request.
 * The items were previously split across Browse / My Transactions / My Account.
 * Nine entries do not need subdividing — three headings for nine links spends
 * more vertical space on labels-about-labels than on the links themselves.
 *
 * Signed OUT, the same instruction scoped the sidebar to "sa loob ng account
 * ni buyer after niya mag login", and a later one made it explicit: "kapag
 * hindi pa nakalogin ang user alisin muna ang side bar". A guest gets the top
 * bar instead — see `publicNavItems` and `PublicShell`.
 *
 * Both shells read the SAME `ENTRIES` array, filtered by the tier's
 * capabilities. That is the point of keeping one list: a link cannot appear in
 * one shell and go missing from the other, and the three account levels in
 * RESERVATION.doc — Guest, Initial, Permanent — each see a correct menu
 * without a hand-written list per tier per shell.
 */

interface Entry {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName;
  /** Always shown when absent. */
  readonly requires?: ClientCapability;
}

const ENTRIES: readonly Entry[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/projects', label: 'Condominium Projects', icon: 'projects', requires: 'browseProjects' },
  { href: '/units', label: 'Available Units', icon: 'units', requires: 'browseProjects' },
  { href: '/compute', label: 'Sample Computation', icon: 'compute' },

  { href: '/tripping', label: 'Request Site Viewing', icon: 'tripping', requires: 'requestTripping' },
  { href: '/dashboard/reservations', label: 'My Reservations', icon: 'reservations', requires: 'reserveUnit' },
  { href: '/dashboard/documents', label: 'My Documents', icon: 'documents', requires: 'uploadDocuments' },

  { href: '/dashboard/soa', label: 'Statement of Account', icon: 'soa', requires: 'viewOwnSoa' },
  { href: '/dashboard/payments', label: 'Payment History', icon: 'payments', requires: 'viewOwnPayments' },
  { href: '/dashboard/profile', label: 'My Profile', icon: 'profile', requires: 'viewOwnProfile' },
];

const visibleTo = (tier: ClientTier): readonly Entry[] =>
  ENTRIES.filter((e) => !e.requires || clientCan(tier, e.requires));

export function navigationFor(tier: ClientTier): NavSection[] {
  const items = visibleTo(tier).map((e) => ({
    href: e.href,
    label: e.label,
    icon: <NavIcon name={e.icon} />,
  }));

  return [{ title: 'Main Menu', items }];
}

export interface PublicNavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * The same links a Guest would have seen in the sidebar, for the top bar.
 *
 * No icons: they earn their place in a vertical list, where they give the eye
 * something to scan down. In a horizontal bar of four items they are just
 * clutter beside the label they duplicate.
 */
export function publicNavItems(): PublicNavItem[] {
  return visibleTo('GUEST').map((e) => ({ href: e.href, label: e.label }));
}
