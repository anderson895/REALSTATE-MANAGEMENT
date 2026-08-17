'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ImagePlus, Images, Trash2 } from 'lucide-react';
import { cloudinaryUrl } from '@sfsr/ui';
import { Modal } from '@sfsr/ui';
import { clearProjectMedia, saveProjectMedia, type MediaSlotName } from './actions';

const ACCEPTED = 'image/jpeg,image/jpg,image/png,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Marketing replacing the pictures on a project.
 *
 * "lagyan din pala ang marketing ng mapag uupdatetan ng mga pictures ng mga
 * projects and unit para kapag may mga bagong record na kailangan idagdag" —
 * until now every picture in the catalogue arrived by running
 * `scripts/seed/upload-media.ts` against files on a developer's disk, so a
 * project added from this screen had no way to ever get one.
 *
 * ── Replace, not add ─────────────────────────────────────────────────────
 *
 * Each slot holds exactly one picture and uploading writes over it, because
 * the Cloudinary path is fixed per slot. That is deliberate: it keeps a
 * browser upload and a seed-script upload pointing at the SAME asset, so the
 * next `upload-media` run does not silently undo an edit made here — and it
 * means every page already rendering that URL updates without being rewritten.
 *
 * The cost is that the old picture is gone. Hence the confirmation on the
 * button and the audit entry the action writes.
 */

export interface MediaTarget {
  readonly slot: MediaSlotName;
  readonly label: string;
  readonly hint: string;
  /** Current picture, when there is one. */
  readonly url: string | null;
  /** Only for `floorPlan`. */
  readonly unitType?: string;
  /** Only for `unitPhoto`. */
  readonly unitId?: string;
}

export function ManageMediaDialog({
  projectId,
  projectName,
  targets,
  trigger,
}: {
  projectId: string;
  projectName: string;
  targets: readonly MediaTarget[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={`Pictures — ${projectName}`}
      description="Uploading replaces the picture in that slot. The old one is not kept."
      trigger={
        trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            <Images className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Pictures
          </button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {targets.map((target) => (
          <MediaSlotCard
            key={`${target.slot}-${target.unitType ?? target.unitId ?? ''}`}
            projectId={projectId}
            target={target}
          />
        ))}
      </div>
    </Modal>
  );
}

function MediaSlotCard({ projectId, target }: { projectId: string; target: MediaTarget }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown immediately after a successful upload. The server URL is identical
  // to the previous one — the path is fixed — so nothing on the page would
  // otherwise appear to change until the CDN cache expires.
  const [justUploaded, setJustUploaded] = useState<string | null>(null);
  // Separate from `justUploaded` being null, which only means "nothing has been
  // uploaded in this session" and would fall back to the picture that was
  // just removed.
  const [cleared, setCleared] = useState(false);
  const [, startTransition] = useTransition();

  const current = cleared ? null : (justUploaded ?? target.url);

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const result = await clearProjectMedia({
        projectId,
        slot: target.slot,
        unitType: target.unitType,
        unitId: target.unitId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCleared(true);
      setJustUploaded(null);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not remove that picture. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('That file is over 10 MB.');
      return;
    }
    if (!ACCEPTED.split(',').includes(file.type)) {
      setError('Use a JPG, PNG or WebP.');
      return;
    }

    setBusy(true);
    try {
      const ticketResponse = await fetch('/api/upload/project-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          slot: target.slot,
          unitType: target.unitType,
          unitId: target.unitId,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!ticketResponse.ok) {
        const body = (await ticketResponse.json()) as { error?: string };
        setError(body.error ?? 'Could not prepare the upload.');
        return;
      }
      const ticket = (await ticketResponse.json()) as {
        cloudName: string;
        apiKey: string;
        signature: string;
        timestamp: number;
        publicId: string;
      };

      // Exactly the fields the ticket signed, and no others: Cloudinary
      // rejects the upload if the set differs by even one.
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', ticket.apiKey);
      form.append('timestamp', String(ticket.timestamp));
      form.append('signature', ticket.signature);
      form.append('public_id', ticket.publicId);
      form.append('overwrite', 'true');
      form.append('invalidate', 'true');

      const upstream = await fetch(
        `https://api.cloudinary.com/v1_1/${ticket.cloudName}/image/upload`,
        { method: 'POST', body: form },
      );
      if (!upstream.ok) {
        setError('The upload was refused. Please try again.');
        return;
      }
      const result = (await upstream.json()) as { secure_url?: string };
      if (!result.secure_url) {
        setError('Uploaded, but no address came back. Try again.');
        return;
      }

      const saved = await saveProjectMedia({
        projectId,
        slot: target.slot,
        url: result.secure_url,
        unitType: target.unitType,
        unitId: target.unitId,
      });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }

      // Cache-busted, because the URL did not change and the browser would
      // otherwise keep showing the picture that was just replaced.
      setJustUploaded(`${result.secure_url}?v=${Date.now()}`);
      setCleared(false);
      startTransition(() => router.refresh());
    } catch {
      setError('Upload failed. Check the connection and try again.');
    } finally {
      setBusy(false);
      // Cleared so choosing the SAME file again still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold text-neutral-800">{target.label}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{target.hint}</p>

      <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
        {current ? (
          <Image
            src={cloudinaryUrl(current, { width: 480, height: 360, crop: 'fit' })}
            alt={target.label}
            fill
            sizes="240px"
            className="object-contain"
            unoptimized={current.includes('?v=')}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-400">
            No picture yet
          </span>
        )}
      </div>

      <label
        className={`mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600 transition-colors hover:border-navy-400 hover:text-navy-700 ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
        {busy ? 'Uploading…' : current ? 'Replace' : 'Upload'}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>

      {/*
        * Remove, not just Replace.
        *
        * Uploading the wrong file is the common mistake, and without this the
        * only way out was to upload a DIFFERENT wrong file. "No picture" is
        * also a legitimate answer — the Portal draws its own placeholder for a
        * project with no render, and a unit with no photo simply shows the
        * floor plan.
        */}
      {current ? (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Remove picture
        </button>
      ) : null}

      {error ? <p className="mt-1.5 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
