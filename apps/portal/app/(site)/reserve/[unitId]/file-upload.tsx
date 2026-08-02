'use client';

import { useRef, useState } from 'react';

export interface UploadedFile {
  readonly publicId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

const ACCEPTED = 'application/pdf,image/jpeg,image/jpg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Signed direct-to-Cloudinary upload.
 *
 * Three steps, and the ordering is the point:
 *   1. ask our server to sign THIS upload,
 *   2. send the bytes straight to Cloudinary with that signature,
 *   3. keep only the returned public_id.
 *
 * The file never passes through our server — no upload size limits to tune,
 * no memory spike on a 10 MB scan — and the browser never holds a Cloudinary
 * credential. The asset lands as `authenticated`, so its URL alone will not
 * open it (Development Plan.md §2.4).
 */
export function FileUpload({
  kind,
  slug,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  kind: 'reservation-payment' | 'client-document';
  slug: string;
  label: string;
  hint?: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setLocalError(null);

    if (file.size > MAX_BYTES) {
      setLocalError('Maximum file size is 10 MB.');
      return;
    }
    if (!ACCEPTED.split(',').includes(file.type)) {
      setLocalError('Accepted file types are PDF, JPG, JPEG and PNG.');
      return;
    }

    setBusy(true);
    try {
      const ticketResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, slug, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!ticketResponse.ok) {
        const body = (await ticketResponse.json()) as { error?: string };
        setLocalError(body.error ?? 'Could not prepare the upload.');
        return;
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

      // `auto` so a PDF is stored as a raw file rather than being treated as
      // an image and rejected.
      const upstream = await fetch(
        `https://api.cloudinary.com/v1_1/${ticket.cloudName}/auto/upload`,
        { method: 'POST', body: form },
      );
      if (!upstream.ok) {
        setLocalError('Upload failed. Please try again.');
        return;
      }
      const result = (await upstream.json()) as { public_id?: string };

      onChange({
        publicId: result.public_id ?? ticket.publicId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch {
      setLocalError('Upload failed. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const shown = error ?? localError;

  return (
    <div>
      <p className="text-sm font-medium">
        {label}
        <span className="ml-0.5 text-rose-500">*</span>
      </p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}

      {value ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 dark:border-brand-900 dark:bg-brand-950/40">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-brand-800 dark:text-brand-300">
              {value.fileName}
            </p>
            <p className="text-xs text-brand-700/70 dark:text-brand-400/70">
              {(value.sizeBytes / 1024 / 1024).toFixed(2)} MB · uploaded
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="shrink-0 text-xs text-brand-700 hover:underline dark:text-brand-400"
          >
            Replace
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 disabled:opacity-60"
          />
          {busy ? <p className="mt-1.5 text-xs text-neutral-500">Uploading…</p> : null}
        </div>
      )}

      {shown ? (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{shown}</p>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-400">PDF, JPG, JPEG or PNG · maximum 10 MB</p>
      )}
    </div>
  );
}
