/**
 * Sidebar icons.
 *
 * Hand-written SVG paths rather than an icon package. The portal needs exactly
 * nine glyphs, and the smallest icon library that would supply them adds a
 * dependency and a bundle for something a screenshot's worth of `<path>` data
 * covers. They are also plain elements, which matters: the nav is built on the
 * server and handed to `MobileNav`, a Client Component, so anything in it has
 * to survive serialisation. A component from a library would not.
 *
 * Drawn on a 24-unit grid, rendered at 16px, `currentColor` throughout — the
 * sidebar sets the colour and the active/idle states carry through for free.
 */

export type NavIconName =
  | 'home'
  | 'projects'
  | 'units'
  | 'compute'
  | 'tripping'
  | 'reservations'
  | 'documents'
  | 'soa'
  | 'payments'
  | 'profile';

const PATHS: Record<NavIconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.75 20v-5.5h4.5V20" />
    </>
  ),
  projects: (
    <>
      <rect x="3.5" y="3" width="10" height="18" rx="1.2" />
      <path d="M13.5 9H20a.5.5 0 0 1 .5.5V21" />
      <path d="M6.75 6.75h3.5M6.75 10.25h3.5M6.75 13.75h3.5M16.5 12.5h1.5M16.5 16h1.5" />
    </>
  ),
  units: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
    </>
  ),
  compute: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <rect x="7" y="5.5" width="10" height="3.5" rx="0.6" />
      <path d="M7.75 13h.01M12 13h.01M16.25 13h.01M7.75 17h.01M12 17h.01M16.25 17h.01" />
    </>
  ),
  tripping: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  reservations: (
    <>
      <path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="8.5" y="2.5" width="7" height="3.5" rx="1" />
      <path d="M8.5 11h7M8.5 15h4.5" />
    </>
  ),
  documents: (
    <>
      <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2.5v5h5" />
      <path d="M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  soa: (
    <>
      <path d="M6 2.5h12v19l-2.4-1.6-2.4 1.6-2.4-1.6L8.4 21.5 6 19.9z" />
      <path d="M9.5 7.5h5M9.5 11h5M9.5 14.5h3" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h3.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
