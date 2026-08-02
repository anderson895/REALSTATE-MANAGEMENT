import { v2 as cloudinary } from 'cloudinary';
import { getServerConfig } from '../config';

/**
 * Cloudinary storage adapter — SERVER ONLY.
 *
 * ── Why signed, and why `authenticated` ───────────────────────────────────
 *
 * The project originally shipped an UNSIGNED upload preset. That means anyone
 * who reads the cloud name out of the JavaScript bundle can upload arbitrary
 * files to the account, and every stored asset is fetchable by URL alone.
 *
 * Government IDs and payment receipts cannot be stored that way. RESERVATION.doc
 * commits the company to the Data Privacy Act of 2012 in three separate
 * clauses, and a scan of someone's driver's licence sitting on a public CDN
 * is not defensible under any of them.
 *
 * So: the browser never holds a credential. It asks this server to sign a
 * specific upload — a fixed folder, a fixed public_id, a short-lived
 * timestamp — and Cloudinary rejects anything that does not match the
 * signature. Sensitive assets use `type: 'authenticated'`, which makes the
 * URL alone insufficient; retrieval needs a signed, expiring link.
 *
 * Marketing assets (project renders, floor plans) stay on `type: 'upload'` —
 * the public CDN — because they are meant to be public.
 *
 * See Development Plan.md §2.4 and §12.2.
 */

export type AssetKind = 'reservation-payment' | 'client-document' | 'contract';

/** Where each kind of file lives, and how it is delivered. */
const ASSET_POLICY: Record<AssetKind, { folder: string; type: 'authenticated' }> = {
  'reservation-payment': { folder: 'sfsr/reservations/payments', type: 'authenticated' },
  'client-document': { folder: 'sfsr/clients/documents', type: 'authenticated' },
  contract: { folder: 'sfsr/contracts', type: 'authenticated' },
};

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

/** RESERVATION.doc: "Maximum File Size: 10 MB". */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadTicket {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly signature: string;
  readonly timestamp: number;
  readonly publicId: string;
  readonly folder: string;
  readonly type: 'authenticated';
}

function configure(): ReturnType<typeof getServerConfig>['cloudinary'] {
  const { cloudinary: config } = getServerConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  return config;
}

/**
 * Signs one specific upload.
 *
 * The signature covers the folder, the public_id and the timestamp, so a
 * ticket issued for a buyer's own document cannot be replayed to overwrite
 * somebody else's — the public_id is derived server-side from the caller's
 * uid, never taken from the request.
 */
export function createUploadTicket(kind: AssetKind, ownerUid: string, slug: string): UploadTicket {
  const config = configure();
  const policy = ASSET_POLICY[kind];

  const timestamp = Math.round(Date.now() / 1000);
  const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'file';
  const publicId = `${ownerUid}/${safeSlug}-${timestamp}`;

  const signature = cloudinary.utils.api_sign_request(
    { folder: policy.folder, public_id: publicId, timestamp, type: policy.type },
    config.apiSecret,
  );

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    signature,
    timestamp,
    publicId,
    folder: policy.folder,
    type: policy.type,
  };
}

/**
 * A time-limited URL for an authenticated asset.
 *
 * Used when Documentation Staff open a buyer's ID for verification. The link
 * stops working when it expires, so a URL pasted into a chat or an email does
 * not become a permanent hole.
 */
export function signedUrlFor(publicId: string, expiresInSeconds = 300): string {
  configure();
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
  });
}

export async function deleteAsset(publicId: string): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
}
