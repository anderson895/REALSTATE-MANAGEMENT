'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Google reCAPTCHA v2 "I'm not a robot" checkbox.
 *
 * Written directly against the explicit-render API rather than pulling in a
 * wrapper package: it is about sixty lines, and a third-party wrapper is one
 * more thing to keep compatible with React 19.
 *
 * The widget hands back a token; the token is meaningless until the server
 * verifies it against Google with our secret. See
 * packages/infrastructure/src/captcha/recaptcha.ts.
 */

interface GreCaptcha {
  render: (
    container: HTMLElement,
    params: {
      sitekey: string;
      theme?: 'light' | 'dark';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => number;
  reset: (widgetId?: number) => void;
}

declare global {
  interface Window {
    grecaptcha?: GreCaptcha & { ready?: (cb: () => void) => void };
    __sfsrRecaptchaOnload?: () => void;
  }
}

const SCRIPT_ID = 'sfsr-recaptcha-script';

/** One shared promise, so several widgets on a page load the script once. */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.grecaptcha?.render) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    window.__sfsrRecaptchaOnload = () => resolve();

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src =
      'https://www.google.com/recaptcha/api.js?onload=__sfsrRecaptchaOnload&render=explicit';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function Recaptcha({
  siteKey,
  onChange,
  error,
  resetKey = 0,
}: {
  siteKey: string;
  onChange: (token: string | null) => void;
  error?: string;
  /**
   * Increment to clear the ticked box.
   *
   * A token may be redeemed exactly once. After a failed submit the token is
   * spent, so without a reset the buyer's retry is rejected by Google as
   * `timeout-or-duplicate` — which reads to them as "the form is broken".
   */
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const domId = useId();

  // Keep the latest callback without re-rendering the widget: grecaptcha.render
  // cannot be called twice on the same container, so the effect below must not
  // depend on `onChange`.
  //
  // Assigned in an effect, not during render: writing to a ref while rendering
  // is unsafe under concurrent rendering, where a render may be discarded.
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    // No setState here for the missing-key case: the component early-returns
    // a "not configured" panel below, so `status` is never read in that path.
    if (!siteKey) return;

    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;

        const prefersDark =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;

        widgetIdRef.current = window.grecaptcha!.render(containerRef.current, {
          sitekey: siteKey,
          theme: prefersDark ? 'dark' : 'light',
          callback: (token) => onChangeRef.current(token),
          // A token is valid for roughly two minutes. Clearing it here stops
          // the form submitting a token Google will reject as expired.
          'expired-callback': () => onChangeRef.current(null),
          'error-callback': () => onChangeRef.current(null),
        });

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    // Skip the initial mount — there is nothing to clear yet.
    if (resetKey === 0 || widgetIdRef.current === null) return;
    window.grecaptcha?.reset(widgetIdRef.current);
  }, [resetKey]);

  if (!siteKey) {
    return (
      <div className="rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <p className="font-medium">reCAPTCHA is not configured</p>
        <p className="mt-0.5">
          Set <code>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code> and <code>RECAPTCHA_SECRET_KEY</code>.
          Registration will be rejected by the server until both are present.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} id={domId} className="min-h-[78px]" />

      {status === 'loading' ? (
        <p className="text-xs text-neutral-500">Loading verification…</p>
      ) : null}
      {status === 'failed' ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Could not load the verification widget. Check your connection and reload the page.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
