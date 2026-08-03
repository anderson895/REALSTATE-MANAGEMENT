'use client';

import { useCallback, useRef, useState } from 'react';
import { validateIdUpload, type IdType, type IdValidationResult } from '@sfsr/domain';

/**
 * Reads both sides of an ID in the BROWSER and grades them.
 *
 * ── Why in the browser ───────────────────────────────────────────────────
 *
 * Not a preference — a constraint. Uploads land in Cloudinary as
 * `authenticated` assets, so their URLs will not open on their own and the
 * image cannot be fetched back to read server-side. The bytes are readable
 * here or nowhere.
 *
 * It also costs nothing. tesseract.js runs on WASM with no API key and no
 * billing account, which matters on a project sitting on Firebase's free
 * plan — Google Vision would need billing enabled even for its free tier.
 *
 * ── What it costs ────────────────────────────────────────────────────────
 *
 * The recognition core and the English model are about 5 MB, downloaded once
 * and then cached by the browser. The first scan is therefore slow — roughly
 * ten seconds — and every later one is quick. The UI says so rather than
 * leaving the buyer watching a bar.
 *
 * The worker is created lazily and kept for the life of the component, so
 * scanning the back does not pay the startup cost again.
 */

export type IdCheckPhase = 'idle' | 'loading-model' | 'reading-front' | 'reading-back' | 'done';

export interface IdCheckState {
  readonly phase: IdCheckPhase;
  readonly progress: number;
  readonly result: IdValidationResult | null;
  /** Set when the scan itself broke — distinct from the ID being refused. */
  readonly error: string | null;
}

const IDLE: IdCheckState = { phase: 'idle', progress: 0, result: null, error: null };

/** OCR output held against the exact files it came from. */
interface ScanCache {
  readonly front: File;
  readonly back: File | null;
  readonly frontText: string;
  readonly backText?: string;
}

export function useIdCheck() {
  const [state, setState] = useState<IdCheckState>(IDLE);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const scanRef = useRef<ScanCache | null>(null);

  /** Imported lazily so ~5 MB of WASM is not in the bundle every buyer downloads. */
  async function createWorker() {
    const { createWorker: make } = await import('tesseract.js');
    return make('eng');
  }

  const reset = useCallback(() => setState(IDLE), []);

  const run = useCallback(
    async (front: File, back: File | null, selectedIdType: IdType, registeredName: string) => {
      /*
       * Reading the images and GRADING them are separate jobs, and only the
       * first is expensive.
       *
       * Correcting the ID type in the dropdown changes nothing about what the
       * card says — the same text now just has to be measured against a
       * different answer. Re-running tesseract there would make a buyer who
       * simply fixed a dropdown wait through another scan, for a result the
       * cached text already determines.
       *
       * Identity comparison on the File objects, not names or sizes: picking
       * a different file always produces a new object, and two different
       * photos can easily share both a name and a byte count.
       */
      const cached = scanRef.current;
      if (cached && cached.front === front && cached.back === back) {
        const result = validateIdUpload({
          frontText: cached.frontText,
          backText: cached.backText,
          selectedIdType,
          registeredName,
        });
        setState({ phase: 'done', progress: 1, result, error: null });
        return result;
      }

      setState({ phase: 'loading-model', progress: 0, result: null, error: null });

      try {
        workerRef.current ??= await createWorker();
        const worker = workerRef.current;

        setState((s) => ({ ...s, phase: 'reading-front', progress: 0.15 }));
        const frontText = (await worker.recognize(front)).data.text;

        let backText: string | undefined;
        if (back) {
          setState((s) => ({ ...s, phase: 'reading-back', progress: 0.6 }));
          backText = (await worker.recognize(back)).data.text;
        }

        scanRef.current = { front, back, frontText, backText };

        const result = validateIdUpload({
          frontText,
          backText,
          selectedIdType,
          registeredName,
        });

        setState({ phase: 'done', progress: 1, result, error: null });
        return result;
      } catch {
        /*
         * A broken scan must not become a refusal.
         *
         * If the worker fails to load — an offline moment, a blocked CDN, a
         * browser without the WASM features — the honest outcome is "we could
         * not check this", and the buyer continues to staff review. Treating
         * an infrastructure failure as a bad document would lock people out of
         * a reservation over something that is not their fault.
         */
        setState({
          phase: 'done',
          progress: 1,
          result: null,
          error: 'We could not scan your ID on this device. You can continue — staff will review it.',
        });
        return null;
      }
    },
    [],
  );

  return { ...state, run, reset };
}
