'use client';

import { useState, useTransition } from 'react';
import { ScanLine } from 'lucide-react';
import { ID_TYPES, validateIdUpload, type IdType } from '@sfsr/domain';
import { recordIdRecheck } from './verify-id-action';

/**
 * Re-runs the ID format check from the reviewer's own screen.
 *
 * note.txt: "ibalik yung OCR sa internal, dapat maveverify kung tama yung
 * format ng ID na inupload niya."
 *
 * ── Why this exists when the buyer's browser already checked ─────────────
 *
 * Two reasons, and the second is the stronger one.
 *
 * A stored verdict came from the buyer's machine and could say anything. It is
 * a hint. A reviewer who wants an answer they can stand behind needs one taken
 * on their own screen, under their own name.
 *
 * And WALK-IN reservations have no verdict at all. The counter form uploads an
 * ID and runs nothing — `walk-in/actions.ts` says so outright: "No nameCheck,
 * and that is the truth rather than an omission." Every ID taken across the
 * counter is currently unchecked, and this is the only thing that checks them.
 *
 * ── Why the OCR runs here rather than on the server ──────────────────────
 *
 * The image is a Cloudinary `authenticated` asset behind a signed URL that
 * expires in five minutes. The browser already has that URL — it is displaying
 * the image — and Cloudinary serves it with `access-control-allow-origin: *`,
 * so tesseract can read the pixels directly. Doing it server-side would mean
 * fetching the image back and running a 5 MB WASM engine in a function to
 * repeat work the laptop does for free.
 *
 * ── What it costs the reviewer ───────────────────────────────────────────
 *
 * The first run downloads ~5 MB of recognition core and language data, so it
 * takes about ten seconds. The button says so rather than appearing to hang.
 */

export interface VerifyIdProps {
  readonly reservationNumber: string;
  readonly documentId: string;
  /** Signed, expiring URLs. Regenerated on every page render. */
  readonly frontUrl: string;
  readonly backUrl: string | null;
  /** What the buyer said the card was. */
  readonly idType: string | null;
  readonly registeredName: string;
}

type Phase = 'idle' | 'loading' | 'reading-front' | 'reading-back' | 'saving';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Verify ID format',
  loading: 'Loading the recogniser…',
  'reading-front': 'Reading the front…',
  'reading-back': 'Reading the back…',
  saving: 'Saving the result…',
};

export function VerifyId({
  reservationNumber,
  documentId,
  frontUrl,
  backUrl,
  idType,
  registeredName,
}: VerifyIdProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const busy = phase !== 'idle' || pending;

  // The stored `idType` is a free string. Only a recognised one can be checked
  // against — otherwise Stage 1b has nothing to compare to.
  const selected = ID_TYPES.find((type) => type === idType) as IdType | undefined;

  async function run() {
    setError(null);

    if (!selected) {
      setError(
        idType
          ? `"${idType}" is not one of the recognised ID types, so the format cannot be checked against it.`
          : 'This document has no ID type recorded, so there is nothing to check it against.',
      );
      return;
    }

    try {
      setPhase('loading');
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');

      try {
        setPhase('reading-front');
        const front = (await worker.recognize(frontUrl)).data.text;

        let back: string | undefined;
        if (backUrl) {
          setPhase('reading-back');
          back = (await worker.recognize(backUrl)).data.text;
        }

        const result = validateIdUpload({
          frontText: front,
          backText: back,
          selectedIdType: selected,
          registeredName,
        });

        setPhase('saving');
        const saved = await new Promise<Awaited<ReturnType<typeof recordIdRecheck>>>((resolve) => {
          startTransition(async () => {
            resolve(
              await recordIdRecheck({
                reservationNumber,
                documentId,
                verdict: result.verdict,
                looksLikeId: result.looksLikeId,
                idTypeMatch: result.idTypeMatch,
                detectedId: result.detectedId,
                backSideDistinct: result.backSideDistinct,
              }),
            );
          });
        });

        if (!saved.ok) setError(saved.error ?? 'Could not save the result.');
      } finally {
        // Freed either way. The worker holds the 5 MB engine in memory, and a
        // reviewer works through a queue of these.
        await worker.terminate();
      }
    } catch {
      setError('The check could not run. The image link may have expired — reload and try again.');
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition-colors hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ScanLine className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {busy ? PHASE_LABEL[phase === 'idle' ? 'saving' : phase] : PHASE_LABEL.idle}
      </button>

      {phase === 'loading' ? (
        <p className="mt-1.5 text-[11px] text-neutral-500">
          The recogniser is about 5 MB and downloads once — the first check takes roughly ten
          seconds, later ones are quick.
        </p>
      ) : null}

      {error ? <p className="mt-1.5 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
