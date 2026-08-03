/**
 * The two skins the application shell can wear.
 *
 * Kept in a plain data module rather than inline in `sidebar.tsx` because the
 * desktop aside and the mobile drawer are separate components — one a Server
 * Component, one a Client Component — that must not be allowed to drift into
 * two different-looking menus. A style object crosses that boundary the only
 * way anything can: by both sides importing it, not by being passed.
 *
 * `light` is the original neutral skin and is byte-for-byte what the Internal
 * Management System already rendered; it is the default so that app is not
 * touched by this file existing.
 *
 * `brand` is the buyer portal's deep-green sidebar — an explicit client
 * instruction, with a reference screenshot: white logo plate on top, green
 * body, gold marking the current page, tagline at the foot.
 */

export type ShellVariant = 'light' | 'brand';

export interface ShellStyles {
  /** The aside / drawer panel itself. */
  readonly surface: string;
  /** The plate holding the logo and company name. */
  readonly brandBlock: string;
  readonly brandText: string;
  readonly subtitleText: string;
  /** "MAIN MENU" and the other group headings. */
  readonly sectionTitle: string;
  readonly item: string;
  readonly itemActive: string;
  readonly badge: string;
  readonly footer: string;
  /** Close button on the mobile drawer, which sits on the brand plate. */
  readonly closeButton: string;
}

export const SHELL_STYLES: Record<ShellVariant, ShellStyles> = {
  light: {
    surface: 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
    brandBlock: 'border-b border-neutral-200 dark:border-neutral-800',
    brandText: 'text-sm font-semibold text-brand-700 dark:text-brand-300',
    subtitleText: 'text-xs text-neutral-500 dark:text-neutral-400',
    sectionTitle: 'text-[11px] font-semibold uppercase tracking-wider text-neutral-400',
    item: 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
    itemActive:
      'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
    badge: 'bg-brand-600 text-white',
    footer: 'border-t border-neutral-200 dark:border-neutral-800',
    closeButton: 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800',
  },

  brand: {
    // Stays green in dark mode rather than flipping to neutral: the sidebar IS
    // the brand surface, and a company colour that disappears at night is not
    // one. It only deepens.
    surface: 'border-brand-800 bg-brand-600 dark:border-black/40 dark:bg-brand-900',
    // White plate, as in the reference. The crest is a dark-green mark, so it
    // needs a light ground — on the green body it would vanish.
    brandBlock: 'bg-white dark:bg-neutral-900',
    brandText: 'text-[13px] font-bold uppercase leading-tight tracking-wide text-brand-700 dark:text-brand-300',
    subtitleText: 'text-[10px] uppercase tracking-[0.12em] text-neutral-500',
    sectionTitle: 'text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45',
    // The transparent left border is load-bearing: without it the 2px gold bar
    // on the active item shifts every other label sideways as you navigate.
    item: 'border-l-2 border-transparent text-white/75 hover:bg-white/10 hover:text-white',
    itemActive: 'border-l-2 border-accent-400 bg-brand-500 font-medium text-white',
    badge: 'bg-accent-500 text-white',
    footer: 'border-t border-white/15',
    closeButton: 'text-brand-700 hover:bg-neutral-100 dark:text-brand-300 dark:hover:bg-neutral-800',
  },
};
