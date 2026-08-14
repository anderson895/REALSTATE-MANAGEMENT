'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * The two halves of the profile page.
 *
 * ── Why the panels are passed in rather than rendered here ───────────────
 *
 * Only the switching is client-side. The panels themselves arrive already
 * rendered on the server, so the page keeps reading Firestore with admin
 * credentials and shipping HTML — marking the whole page `'use client'` to get
 * a tab strip would have pushed those reads into a round trip and the
 * credentials nowhere they could go.
 *
 * ── Why not `?tab=` in the URL ───────────────────────────────────────────
 *
 * It would survive a refresh, but this page renders dynamically (the shell
 * reads `cookies()`), so every switch would be a server round trip and a fresh
 * Firestore read to show markup the browser already has. Both panels are small
 * and are already on the page; hiding one is the cheaper move.
 *
 * ── Accessibility ────────────────────────────────────────────────────────
 *
 * Full APG tab pattern: roving tabindex, arrow keys, Home/End. Without it the
 * tab strip is a row of divs that a keyboard cannot reach and a screen reader
 * cannot explain — and the panel it hides is where a buyer changes their
 * password.
 *
 * The inactive panel is unmounted rather than hidden with CSS. Both contain
 * forms, and a `display:none` form is still in the DOM: its inputs stay
 * focusable by name, still submit, and still get offered by a password manager.
 */

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export function Tabs({ tabs }: { tabs: readonly TabDefinition[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusTab(index: number) {
    const bounded = (index + tabs.length) % tabs.length;
    setActive(bounded);
    refs.current[bounded]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusTab(index + 1),
      ArrowLeft: () => focusTab(index - 1),
      Home: () => focusTab(0),
      End: () => focusTab(tabs.length - 1),
    };
    const handler = keys[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile sections"
        className="mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-controls={`${base}-panel-${tab.id}`}
              aria-selected={selected}
              // Roving tabindex: one Tab press reaches the strip, then the
              // arrow keys move within it. Leaving every tab tabbable makes a
              // keyboard user walk through all of them to get past.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) =>
        index === active ? (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${base}-panel-${tab.id}`}
            aria-labelledby={`${base}-tab-${tab.id}`}
            tabIndex={0}
          >
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
