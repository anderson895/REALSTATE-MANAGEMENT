/**
 * Is this menu item the page we are on?
 *
 * Exact match, or a parent of the current path — so `/reservations` stays lit
 * while the user is reading `/reservations/RES-2026-000001`, which has no menu
 * entry of its own.
 *
 * The trailing slash matters. A bare `startsWith(href)` lights `/admin/users`
 * for `/admin/users-archive`, and `/billing/soa` for `/billing/soa-templates`.
 *
 * Kept in a module with no `'use client'` directive so both a Server Component
 * and a Client Component can call it. It is a pure string comparison; the part
 * that has to run in the browser is `usePathname`, not this.
 */
export function isActivePath(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
