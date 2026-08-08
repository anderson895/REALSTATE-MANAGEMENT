'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X } from 'lucide-react';
import { cloudinaryUrl } from '@sfsr/ui';
import type { AnnouncementImageInput } from '@/lib/announcements';

const ACCEPTED = 'image/jpeg,image/jpg,image/png,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Multi-image upload for an announcement.
 *
 * ── How this differs from the walk-in FileUpload, and why ────────────────
 *
 * The counter's uploader takes ONE file, aims it at a named buyer's folder, and
 * stores a Cloudinary `public_id` that the verification screens later resolve
 * through a short-lived signed URL. Everything about it is shaped by the file
 * being a government ID.
 *
 * These are advertisements. They go to the public CDN, so what comes back is a
 * delivery URL that can be stored and rendered directly — which is why this
 * keeps `url` alongside `publicId`, and why a thumbnail can be drawn the moment
 * the upload finishes without asking the server to sign anything.
 *
 * The upload still goes through `/api/upload/announcement` for a ticket. The
 * browser never holds a Cloudinary credential in either flow.
 */
export function ImageUpload({
  images,
  onChange,
  max,
  error,
}: {
  images: readonly AnnouncementImageInput[];
  onChange: (images: AnnouncementImageInput[]) => void;
  max: number;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const full = images.length >= max;

  async function upload(files: FileList): Promise<void> {
    setLocalError(null);
    setBusy(true);

    // `room` rather than slicing to `max` inside the loop: picking six files
    // when four fit should upload four and say so, not fail all six.
    const room = max - images.length;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) {
      setLocalError(`Only ${max} images per announcement — the extra files were skipped.`);
    }

    const uploaded: AnnouncementImageInput[] = [];
    try {
      for (const file of chosen) {
        if (file.size > MAX_BYTES) {
          setLocalError(`${file.name} is over 10 MB.`);
          continue;
        }
        if (!ACCEPTED.split(',').includes(file.type)) {
          setLocalError(`${file.name} is not a JPG, PNG or WebP.`);
          continue;
        }

        const ticketResponse = await fetch('/api/upload/announcement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: file.name.replace(/\.[^.]+$/, ''),
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        if (!ticketResponse.ok) {
          const body = (await ticketResponse.json()) as { error?: string };
          setLocalError(body.error ?? 'Could not prepare the upload.');
          continue;
        }
        const ticket = (await ticketResponse.json()) as {
          cloudName: string;
          apiKey: string;
          signature: string;
          timestamp: number;
          publicId: string;
          folder: string;
          type: string;
        };

        const form = new FormData();
        form.append('file', file);
        form.append('api_key', ticket.apiKey);
        form.append('timestamp', String(ticket.timestamp));
        form.append('signature', ticket.signature);
        form.append('public_id', ticket.publicId);
        form.append('folder', ticket.folder);
        form.append('type', ticket.type);

        const upstream = await fetch(
          `https://api.cloudinary.com/v1_1/${ticket.cloudName}/image/upload`,
          { method: 'POST', body: form },
        );
        if (!upstream.ok) {
          setLocalError(`${file.name} failed to upload.`);
          continue;
        }
        const result = (await upstream.json()) as { public_id?: string; secure_url?: string };
        if (!result.secure_url) {
          setLocalError(`${file.name} uploaded without a URL — try again.`);
          continue;
        }

        uploaded.push({
          publicId: result.public_id ?? ticket.publicId,
          url: result.secure_url,
          fileName: file.name,
        });
      }

      if (uploaded.length > 0) onChange([...images, ...uploaded]);
    } catch {
      setLocalError('Upload failed. Please check the connection and try again.');
    } finally {
      setBusy(false);
      // Cleared so picking the SAME file again still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const shown = error ?? localError;

  return (
    <div>
      <p className="text-sm font-medium text-neutral-700">Pictures</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Project renders, event photos, promotional art. Up to {max} — JPG, PNG or WebP, maximum
        10 MB each.
      </p>

      {images.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <li
              key={image.publicId}
              className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={cloudinaryUrl(image.url, { width: 320, height: 240, crop: 'fill' })}
                  alt={image.fileName}
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(images.filter((i) => i.publicId !== image.publicId))}
                aria-label={`Remove ${image.fileName}`}
                className="absolute right-1.5 top-1.5 rounded-full bg-neutral-900/70 p-1 text-white transition-colors hover:bg-rose-600"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <p className="truncate px-2 py-1.5 text-[10px] text-neutral-500">{image.fileName}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {!full ? (
        <div className="mt-3">
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-sm text-neutral-500 transition-colors hover:border-navy-400 hover:text-navy-700 ${
              busy ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <ImagePlus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            {busy ? 'Uploading…' : images.length === 0 ? 'Add pictures' : 'Add more'}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) void upload(files);
              }}
            />
          </label>
        </div>
      ) : null}

      {shown ? <p className="mt-1.5 text-xs text-rose-600">{shown}</p> : null}
    </div>
  );
}
