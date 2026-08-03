'use client';

import { Menu } from 'lucide-react';

/**
 * Collapses the desktop sidebar to an icon rail.
 *
 * Holds NO React state, deliberately. The collapsed flag lives as a class on
 * <html>, which the server sets from a cookie, so a `useState` here would be
 * a second copy of the same fact — and one that starts out wrong on the first
 * client render, because the server cannot know what `document` says. That is
 * precisely the hydration mismatch this avoids.
 *
 * ONE icon, the hamburger, in both states.
 *
 * This started as a `PanelLeftClose` / `PanelLeftOpen` pair on the reasoning
 * that a changing icon tells you what the press will do. That reasoning was
 * sound and still lost to the better argument: the hamburger is the control
 * people already know. A cleverer icon that has to be learned is worse than a
 * plain one that does not, and `aria-expanded` carries the state to anyone who
 * actually needs it announced.
 *
 * Keeping it to one icon also removes the CSS swap the pair needed, so this
 * component no longer has to care about the collapsed class at all.
 */
export function SidebarToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const collapsed = root.classList.toggle('sidebar-collapsed');
    // A year, so the choice survives the session. `SameSite=Lax` because
    // nothing about a sidebar needs to travel on cross-site requests.
    document.cookie = `sfsr-sidebar=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle navigation menu"
      title="Toggle navigation menu"
      className={
        className ??
        'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 md:flex dark:hover:bg-neutral-800'
      }
    >
      <Menu size={20} strokeWidth={1.8} aria-hidden />
    </button>
  );
}
