'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ID_TYPES } from '@sfsr/domain';
import { FileUpload, type UploadedFile } from '../../reserve/[unitId]/file-upload';

/**
 * The buyer's reply to a deficiency notice.
 *
 * ── Why this is the only action on the card now ──────────────────────────
 *
 * The card used to offer "Request withdrawal" and nothing else. A buyer told
 * "the back of your ID is unreadable, upload a clear one" had no way to upload
 * anything — `/dashboard/documents` is read-only — so the only button on the
 * screen was the one that gives up. The reservation fee is non-refundable, so
 * that button cost them money for a bad photograph.
 *
 * This replaces it with the thing they were actually asked to do.
 *
 * ── What it does not do ──────────────────────────────────────────────────
 *
 * Uploading does not clear the deficiency and does not move the status. The
 * file goes to Documentation, who re-verify it; a buyer who could clear their
 * own deficiency by attaching any file at all would have walked around the
 * verification entirely. The copy says so, because a buyer who thinks they are
 * done and is not will not come back when it matters.
 */

const DOCUMENT_TYPES = [
  'Government ID',
  'Proof of Payment',
  'Other supporting document',
] as const;

export function DeficiencyResponse({
  reservationNumber,
  respondedAt,
}: {
  reservationNumber: string;
  /** Set once the buyer has already replied, so the form gives way to a receipt. */
  respondedAt: Date | null;
}) {
  const router = useRouter();
  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0]);
  /*
   * Which card this is — asked here for the same reason the reservation form
   * asks it.
   *
   * The original submission records `idType`, and the ID check compares the
   * card it READS against the card the buyer SAID it was. A correction filed
   * without it produced a document Documentation could not run that check on
   * at all: the Verify ID button on the reservation page has nothing to
   * compare to and refuses. Which is worst here of all the places it could
   * happen, because a correction is usually a REPLY to a rejected ID.
   */
  const [idType, setIdType] = useState<string>('');
  const [frontFile, setFrontFile] = useState<UploadedFile | null>(null);
  const [backFile, setBackFile] = useState<UploadedFile | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * An ID has two sides; a receipt has one.
   *
   * The original submission captures both sides of a government ID, so a
   * correction that only carried one file would replace half of it and leave
   * the desk unable to finish the check that failed. Demanding a second file
   * for a one-sided document would be just as wrong the other way — buyers
   * photographing a blank page to satisfy a form.
   */
  const twoSided = docType === 'Government ID';

  async function submit() {
    if (!frontFile) {
      toast.error('Attach the corrected file first.');
      return;
    }
    if (twoSided && idType === '') {
      toast.error('Choose which ID you are sending.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/reservations/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationNumber,
          docType,
          // Only meaningful for an ID, and dropped otherwise so a receipt does
          // not arrive claiming to be a passport.
          idType: twoSided ? idType : null,
          frontFile,
          // Only sent when the type has a reverse, so a stale back from a
          // previous selection cannot ride along with a receipt.
          backFile: twoSided ? backFile : null,
          note,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not send that.');

      toast.success('Sent. Our team will review it shortly.');
      setFrontFile(null);
      setBackFile(null);
      setIdType('');
      setNote('');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  if (respondedAt) {
    return (
      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-3">
        <p className="text-sm font-medium text-emerald-900">
          You replied on{' '}
          {respondedAt.toLocaleString('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Manila',
          })}
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          Our team is reviewing what you sent. You do not need to do anything else — if something
          is still missing we will tell you here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <p className="text-sm font-medium text-amber-900">Send a correction</p>

      <div className="mt-2 space-y-3">
        <div>
          <label htmlFor="docType" className="block text-xs text-amber-900">
            What are you replacing?
          </label>
          <select
            id="docType"
            value={docType}
            onChange={(event) => {
              setDocType(event.target.value);
              // Switching away from an ID drops the reverse and the card type,
              // so neither can be submitted against a document that has no
              // back and is not an ID.
              if (event.target.value !== 'Government ID') {
                setBackFile(null);
                setIdType('');
              }
            }}
            className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {twoSided ? (
          <div>
            <label htmlFor="idType" className="block text-xs text-amber-900">
              Which ID is it?
            </label>
            <select
              id="idType"
              value={idType}
              onChange={(event) => setIdType(event.target.value)}
              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {ID_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-amber-800">
              Our team checks the card you send against the one you name here, so this has to
              match.
            </p>
          </div>
        ) : null}

        <FileUpload
          kind="client-document"
          slug="correction-front"
          label={twoSided ? 'Front of the ID' : 'Corrected file'}
          hint="PDF, JPG or PNG. Maximum 10 MB."
          value={frontFile}
          onChange={setFrontFile}
        />

        {twoSided ? (
          <FileUpload
            kind="client-document"
            slug="correction-back"
            label="Back of the ID"
            hint="Send this too if the back was the problem, or if it has changed."
            value={backFile}
            onChange={setBackFile}
          />
        ) : null}

        <div>
          <label htmlFor="note" className="block text-xs text-amber-900">
            Anything our team should know (optional)
          </label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Re-took the photo in better light."
            className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy || !frontFile || (twoSided && idType === '')}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send correction'}
        </button>

        {/* Said plainly, because a buyer who thinks this finished the job will
            not come back when we tell them it did not. */}
        <p className="text-[11px] leading-relaxed text-amber-800">
          Sending this does not complete the check. Our team reviews it and will confirm here.
        </p>
      </div>
    </div>
  );
}
