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
 * instruction, with a reference screenshot: green body, gold marking the
 * current page, tagline at the foot. The reference also had a WHITE logo plate
 * on top and that is the one part the client later reversed; see `brandBlock`
 * below for why the white block had to go.
 */

export type ShellVariant = 'light' | 'brand' | 'navy';

export interface ShellStyles {
  /** The aside / drawer panel itself. */
  readonly surface: string;
  /** The plate holding the logo and company name. */
  readonly brandBlock: string;
  readonly brandText: string;
  readonly subtitleText: string;
  /** "MAIN MENU" and the other group headings, when they are plain captions. */
  readonly sectionTitle: string;
  /**
   * The row that OPENS a group, when `collapsibleSections` is on.
   *
   * Distinct from `sectionTitle`: that styles a caption above a list, this
   * styles a pressable row that looks like the links beneath it. Falls back to
   * `item` when a skin does not set it.
   */
  readonly sectionToggle?: string;
  /** Rule down the left of an open group's children. */
  readonly subtree?: string;
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
    //
    // Border colour MATCHES the background so the shared `border-r` on the
    // aside disappears. It was #17331f against #234b31 — near-black, and it
    // read as a hard line down the edge of the panel. Recolouring it beats
    // trying to cancel `border-r` from here: both would be single-class
    // selectors, so which one won would come down to stylesheet order.
    surface: 'border-brand-600 bg-brand-600 dark:border-brand-900 dark:bg-brand-900',
    /*
     * The plate is GREEN, one step deeper than the body — not white.
     *
     * It was white, matching the client's original reference screenshot, and
     * the client has since asked for the opposite: "itry nalang itong gawin
     * same sa theme color ng sidebar at medyo dark ... hindi na din magmukhang
     * may plain line."
     *
     * They are describing a real defect rather than a preference. A white block
     * sitting on a deep-green panel meets it in a hard horizontal edge across
     * the full width of the sidebar, and that edge reads as a stray rule
     * somebody forgot to remove — there is nothing else on the page it belongs
     * to. `brand-800` on `brand-600` separates the plate from the menu by TONE,
     * which is exactly what the navy skin does for the Internal system and why
     * that one never grew the same complaint.
     *
     * ── The reason white was chosen, and why it no longer applies ────────
     *
     * "The crest is a dark-green mark, so it needs a light ground — on the
     * green body it would vanish." Half right. The mark is a MEDIUM green
     * stroke (#4a9d4a-ish) with orange and purple diagonals, and against
     * #17331f it clears 6:1 — the Internal system already renders the same file
     * on a dark navy plate and it reads fine. What would genuinely vanish is a
     * dark-green mark, and this is not one.
     */
    brandBlock: 'bg-brand-800 dark:bg-brand-900',
    // White, not brand-700: the plate is now the dark surface, so the title has
    // to come forward off it rather than sink into it. This is the whole of
    // "para kita yung title".
    brandText: 'text-[13px] font-bold uppercase leading-tight tracking-wide text-white',
    subtitleText: 'text-[10px] uppercase tracking-[0.12em] text-white/55',
    sectionTitle: 'text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45',
    item: 'text-white/75 hover:bg-white/10 hover:text-white',
    // Filled gold, per the reference design — not the earlier gold left bar on
    // a lighter green. On a green panel a slightly-lighter green says "hover",
    // not "you are here"; the gold is unmistakable. Text goes to the darkest
    // green rather than white, because white on #d99a35 is barely readable.
    itemActive: 'bg-accent-400 font-semibold text-brand-900',
    badge: 'bg-accent-500 text-white',
    footer: 'border-t border-white/15',
    // Sits ON the brand plate, so it follows it. Dark-green-on-white became
    // invisible the moment the plate stopped being white.
    closeButton: 'text-white/80 hover:bg-white/10',
  },

  /*
   * The Internal Management System, from INTERNAL.xls sheet `USER INTERFACE`.
   *
   * One skin across every department — Documentation, Billing, Account
   * Receivables and Sales are drawn with the SAME sidebar in the sheet, and
   * only their menu items differ. That is already how `navigationFor(role)`
   * works, so this variant plus the RBAC matrix gives each role its own menu
   * with nothing per-role written here.
   *
   * No `dark:` anywhere below, unlike the two skins above. There is no dark
   * variant of this design to switch to and the app pins `forced="light"`; a
   * dark: class here would be a rule that can never match, kept alive only
   * because it looked symmetrical.
   */
  navy: {
    // The brand plate is navy too, so the panel is one unbroken field of it —
    // the sheet has no white logo block here, unlike the Portal's green skin.
    // Border matches the fill so the shared `border-r` on the aside vanishes.
    surface: 'border-navy-800 bg-navy-800',
    // Very slightly deeper than the body, which is what separates the plate
    // from the menu without drawing a line across the panel.
    brandBlock: 'bg-navy-900',
    brandText: 'text-[13px] font-bold uppercase leading-tight tracking-wide text-white',
    subtitleText: 'text-[10px] uppercase tracking-[0.14em] text-white/55',
    sectionTitle: 'text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40',
    // Same weight and colour as a link, so the row reads as one. It is not
    // dimmed like a caption — it is pressable, and dimming it says otherwise.
    sectionToggle: 'font-medium text-white/85 hover:bg-white/10 hover:text-white',
    subtree: 'ml-[1.05rem] border-l border-white/15 pl-2',
    item: 'text-white/80 hover:bg-white/10 hover:text-white',
    /*
     * A gold GRADIENT, left to right, not a flat fill.
     *
     * The sheet's active pill is lighter on its left edge (#f7e2a0) and
     * settles to #edc16a — sampled, not guessed. A flat 400 reads noticeably
     * duller beside it. Text goes to the darkest navy rather than white,
     * because white on #edc16a fails contrast outright.
     */
    itemActive:
      'bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300 font-semibold text-navy-900 shadow-sm',
    badge: 'bg-gold-400 text-navy-900',
    footer: 'border-t border-white/10',
    closeButton: 'text-white/80 hover:bg-white/10',
  },
};
