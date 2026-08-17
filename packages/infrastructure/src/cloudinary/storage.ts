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

export type AssetKind =
  | 'reservation-payment'
  | 'client-document'
  | 'contract'
  | 'announcement-image';

/**
 * How an asset is delivered.
 *
 * `authenticated` — the URL alone is not enough; retrieval needs a signed,
 * expiring link from `signedUrlFor`. Everything personal is stored this way.
 *
 * `upload` — the public CDN, fetchable by URL by anyone who has it. Correct
 * for exactly one thing: material whose PURPOSE is to be seen publicly.
 */
type Delivery = 'authenticated' | 'upload';

/** Where each kind of file lives, and how it is delivered. */
const ASSET_POLICY: Record<AssetKind, { folder: string; type: Delivery }> = {
  'reservation-payment': { folder: 'sfsr/reservations/payments', type: 'authenticated' },
  'client-document': { folder: 'sfsr/clients/documents', type: 'authenticated' },
  contract: { folder: 'sfsr/contracts', type: 'authenticated' },
  /*
   * Marketing images — project renders and announcement art.
   *
   * PUBLIC, deliberately, and the one kind here that is. `upload-media.ts`
   * already puts project heroes and floor plans on `type: 'upload'` for the
   * same reason: an advertisement behind a 5-minute signed URL is not an
   * advertisement. It also means the Portal can render these straight from the
   * stored URL through `cloudinaryUrl()` with no server round trip.
   *
   * The corollary matters and is the reason this comment exists: NOTHING
   * personal may be uploaded under this kind. The route that issues these
   * tickets accepts images only and is reachable by Marketing alone.
   */
  'announcement-image': { folder: 'sfsr/announcements', type: 'upload' },
};

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

/**
 * Images only — no PDF.
 *
 * An announcement is rendered in an `<img>`; a PDF uploaded to it would store
 * fine and then draw as a broken box on every screen showing the post.
 * `webp` is accepted here although the reservation uploads do not take it,
 * because these come off a designer's machine rather than a buyer's phone.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
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
  readonly type: Delivery;
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

export interface SignedAssetOptions {
  readonly expiresInSeconds?: number;
  /**
   * Deliver a downscaled preview at this width instead of the original.
   *
   * A phone photo of a government ID is 3–5 MB. A verification screen showing
   * a receipt and both sides of an ID would pull ~12 MB per reservation opened
   * if it linked the originals, on an office LAN, for images displayed a few
   * hundred pixels wide. The full-size asset stays one click away.
   */
  readonly width?: number;
}

/**
 * A time-limited URL for an authenticated asset.
 *
 * Used when Documentation Staff open a buyer's ID for verification. The link
 * stops working when it expires, so a URL pasted into a chat or an email does
 * not become a permanent hole.
 */
export function signedUrlFor(publicId: string, options: SignedAssetOptions = {}): string {
  configure();
  const { expiresInSeconds = 300, width } = options;

  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
    // Signed separately from the delivery URL, so the transformation cannot be
    // edited in the address bar to fetch something else.
    ...(width
      ? { transformation: [{ width, crop: 'fit', fetch_format: 'auto', quality: 'auto' }] }
      : {}),
  });
}

export async function deleteAsset(publicId: string): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
}

/**
 * Which picture on a project this upload is replacing.
 *
 * A closed set, because the `public_id` is built from it and a free-text slot
 * would let the caller aim an upload anywhere in the account.
 */
export type MediaSlot =
  | { readonly kind: 'hero' }
  | { readonly kind: 'amenities' }
  | { readonly kind: 'floorPlan'; readonly unitType: string }
  | { readonly kind: 'unitPhoto'; readonly unitId: string };

/** `Three Bedroom` -> `three-bedroom`. Must match scripts/seed/upload-media.ts. */
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Where each slot lives. FIXED, and deliberately identical to the paths
 * `scripts/seed/upload-media.ts` writes.
 *
 * Marketing replacing a floor plan from the browser has to land on the same
 * asset the seed script would, or the two become separate pictures with the
 * same meaning and the next `upload-media` run silently undoes the edit.
 */
function publicIdFor(projectId: string, slot: MediaSlot): string {
  const base = `sfsr/projects/${projectId}`;
  switch (slot.kind) {
    case 'hero':
      return `${base}/hero`;
    case 'amenities':
      return `${base}/amenities`;
    case 'floorPlan':
      return `${base}/floorplans/${slugify(slot.unitType)}`;
    case 'unitPhoto':
      return `${base}/units/${slugify(slot.unitId)}`;
  }
}

/**
 * Signs one replacement of a project or unit picture.
 *
 * ── Why this is not `createUploadTicket` ─────────────────────────────────
 *
 * That one appends a timestamp to every `public_id`, because a buyer uploading
 * a second payment receipt must not overwrite the first — the old one is
 * evidence. Marketing replacing a floor plan wants the opposite: the SAME
 * public_id every time, so the new picture takes the place of the old one and
 * every page already pointing at that URL updates without being rewritten.
 *
 * ── What is still derived server-side ────────────────────────────────────
 *
 * The whole path. The caller names a project and a slot from a closed set, and
 * everything else is built here — the same rule the buyer-side ticket follows,
 * for the same reason: a request that could choose its own `public_id` could
 * overwrite any asset in the account, including somebody's government ID.
 *
 * Delivery is `upload`, the public CDN, because these are advertisements. The
 * corollary is the one on ASSET_POLICY above: nothing personal may be uploaded
 * through this route.
 */
export interface MediaUploadTicket {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly signature: string;
  readonly timestamp: number;
  readonly publicId: string;
}

/**
 * Removes a project or unit picture from the CDN.
 *
 * Separate from `deleteAsset` because that one names `type: 'authenticated'`,
 * and Cloudinary treats the delivery type as part of the asset's identity — a
 * destroy aimed at the wrong type reports success and removes nothing.
 *
 * Clearing the field in Firestore is not enough on its own. These are public
 * assets: the URL keeps working after the document stops mentioning it, so a
 * picture removed only from the database is still a picture anyone holding the
 * link can see.
 */
export async function deleteProjectMedia(projectId: string, slot: MediaSlot): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(publicIdFor(projectId, slot), {
    type: 'upload',
    invalidate: true,
  });
}

export function createProjectMediaTicket(projectId: string, slot: MediaSlot): MediaUploadTicket {
  const config = configure();
  const timestamp = Math.round(Date.now() / 1000);
  const publicId = publicIdFor(projectId, slot);

  // `overwrite` and `invalidate` are signed as well as sent: they are what
  // make a replacement replace, and what clears the CDN's copy of the old
  // picture so staff do not spend an hour wondering why nothing changed.
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, timestamp, overwrite: true, invalidate: true },
    config.apiSecret,
  );

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    signature,
    timestamp,
    publicId,
  };
}
