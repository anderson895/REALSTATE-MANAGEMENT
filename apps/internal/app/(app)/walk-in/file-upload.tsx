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
 * Signed direct-to-Cloudinary upload, counter version.
 *
 * The Portal has a near-identical component. The difference is `buyerUid`: on
 * the Portal the folder is derived from the caller's own uid and cannot be
 * aimed anywhere else, which is the whole security model there. At the counter
 * a staff member is uploading the BUYER's receipt into the BUYER's folder, so
 * the target has to be named — and `/api/upload` is what bounds that. See the
 * route for what it checks and what it deliberately does not.
 *
 * Filing these under the employee instead would put a buyer's documents
 * somewhere they can never see them, and break the signed URLs the
 * verification screens build from a client-owned path.
 */
export function FileUpload({
  kind,
  slug,
  buyerUid,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  kind: 'reservation-payment' | 'client-document';
  slug: string;
  buyerUid: string;
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
        body: JSON.stringify({ kind, slug, buyerUid, mimeType: file.type, sizeBytes: file.size }),
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

      // `auto` so a PDF is stored as a raw file rather than treated as an
      // image and rejected.
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
      setLocalError('Upload failed. Please check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const shown = error ?? localError;

  return (
    <div>
      <p className="text-sm font-medium text-neutral-700">
        {label}
        <span className="ml-0.5 text-rose-500">*</span>
      </p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}

      {value ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-navy-200 bg-navy-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-800">{value.fileName}</p>
            <p className="text-xs text-navy-600/70">
              {(value.sizeBytes / 1024 / 1024).toFixed(2)} MB · uploaded
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="shrink-0 text-xs font-medium text-navy-700 hover:underline"
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
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-navy-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-700 disabled:opacity-60"
          />
          {busy ? <p className="mt-1.5 text-xs text-neutral-500">Uploading…</p> : null}
        </div>
      )}

      {shown ? (
        <p className="mt-1.5 text-xs text-rose-600">{shown}</p>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-400">PDF, JPG, JPEG or PNG · maximum 10 MB</p>
      )}
    </div>
  );
}
