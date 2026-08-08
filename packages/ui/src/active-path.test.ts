import { describe, expect, it } from 'vitest';
import { isActivePath } from './active-path';

describe('isActivePath', () => {
  it('lights the item for its own page', () => {
    expect(isActivePath('/admin/users', '/admin/users')).toBe(true);
  });

  it('stays lit on a child route that has no menu entry of its own', () => {
    // Reading RES-2026-000001 should keep "Reservations" highlighted — there is
    // no menu item for the detail page to light instead.
    expect(isActivePath('/reservations/RES-2026-000001', '/reservations')).toBe(true);
  });

  it('does not light a sibling that merely shares a prefix', () => {
    /*
     * The whole reason the trailing slash is in there.
     *
     * A bare startsWith would light "Users & Roles" on /admin/users-archive,
     * and "Statements of Account" on /billing/soa-templates — two items lit at
     * once, which is how a sidebar stops being trustworthy.
     */
    expect(isActivePath('/admin/users-archive', '/admin/users')).toBe(false);
    expect(isActivePath('/billing/soa-templates', '/billing/soa')).toBe(false);
  });

  it('does not light one Administration item for another', () => {
    // The reported bug: /admin/maintenance was rendering with "Users & Roles"
    // highlighted. The comparison was never wrong — the path fed to it was
    // stale, because a layout does not re-render on client-side navigation.
    expect(isActivePath('/admin/maintenance', '/admin/users')).toBe(false);
    expect(isActivePath('/admin/maintenance', '/admin/maintenance')).toBe(true);
  });

  it('does not light every item just because the dashboard is "/"', () => {
    // `/` is a prefix of everything, and `${'/'}/` is `//`, which no path
    // starts with. The dashboard therefore lights on `/` alone.
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/clients', '/')).toBe(false);
  });
});
