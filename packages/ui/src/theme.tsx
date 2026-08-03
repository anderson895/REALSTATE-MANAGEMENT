'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { cn } from './cn';

/**
 * True once hydrated, false during the server render.
 *
 * The server cannot know the visitor's stored theme, so the first client
 * render must match the server's or React reports a hydration mismatch. The
 * usual `useState(false)` + `useEffect(() => setMounted(true))` does the job
 * but sets state inside an effect purely to derive a value.
 *
 * `useSyncExternalStore` expresses the same idea directly: it takes separate
 * server and client snapshots, so it returns false on the server and true in
 * the browser with no effect and no extra render.
 */
const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Light / dark / system theming for both apps.
 *
 * `attribute="class"` puts `.dark` on <html>, which is what the
 * `@custom-variant dark` rule in styles.css keys off. next-themes also injects
 * a tiny blocking script that applies the stored choice BEFORE first paint —
 * without it a visitor who chose dark sees a white flash on every navigation.
 *
 * `defaultTheme="system"` keeps the previous behaviour for anyone who never
 * touches the picker: the OS preference still wins by default.
 *
 * `forced` pins one theme and takes the choice away entirely. The buyer portal
 * uses it: the approved design is a light one, and on a visitor whose Windows
 * is set to dark — which is most of them — "system" was silently repainting the
 * whole brochure in near-black. A sales surface does not get to look different
 * depending on the buyer's OS setting.
 */
export function ThemeProvider({
  children,
  forced,
}: {
  children: ReactNode;
  forced?: 'light' | 'dark';
}) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme={forced ?? 'system'}
      enableSystem={!forced}
      forcedTheme={forced}
      // Transitions on a colour change look like a smear across the whole
      // page; suppressing them for the swap keeps it instant.
      disableTransitionOnChange
      storageKey="sfsr-theme"
    >
      {children}
    </NextThemeProvider>
  );
}

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
] as const;

/**
 * Three-way segmented control.
 *
 * Explicit "System" rather than a two-state sun/moon toggle: with only two
 * states, a visitor who wants to follow their OS has no way back once they
 * have picked one.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, forcedTheme } = useTheme();
  const mounted = useMounted();

  // A picker that cannot change anything is worse than no picker: it invites
  // the click and then ignores it. Reading `forcedTheme` here means the apps
  // that pin a theme get this for free, with no prop threaded down through the
  // shell and the mobile drawer to switch it off.
  if (forcedTheme) return null;

  if (!mounted) {
    return (
      <div
        className={cn(
          'h-7 w-full rounded-md bg-neutral-100 dark:bg-neutral-800',
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'flex w-full rounded-md border border-neutral-200 p-0.5 dark:border-neutral-700',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] transition-colors',
              active
                ? 'bg-brand-600 font-medium text-white'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <ThemeIcon name={option.value} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact icon-only variant, for headers where a segmented control is too wide. */
export function ThemeToggleCompact({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme, forcedTheme } = useTheme();
  const mounted = useMounted();

  if (forcedTheme) return null;

  if (!mounted) {
    return <div className={cn('h-8 w-8 rounded-md', className)} aria-hidden="true" />;
  }

  // Cycles light → dark → system, so "System" stays reachable from a single
  // control rather than being lost the moment someone picks a side.
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme ?? 'system'}`}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800',
        className,
      )}
    >
      <ThemeIcon name={theme === 'system' ? 'system' : (resolvedTheme as 'light' | 'dark')} />
    </button>
  );
}

function ThemeIcon({ name }: { name: 'light' | 'dark' | 'system' }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (name === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export { useTheme };
