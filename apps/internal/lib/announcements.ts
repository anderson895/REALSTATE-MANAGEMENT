import { z } from 'zod';

/**
 * An announcement, as Marketing composes it.
 *
 * RBAC.xls row 9 is one line — "Upload announcement, project details" — and
 * these are the fields that line implies: something to read, something to look
 * at, and a way to say which project it is about.
 *
 * ── Why the images carry a URL and the reservation uploads do not ────────
 *
 * A payment receipt is stored as a Cloudinary `public_id` and resolved through
 * `signedUrlFor` every time it is rendered, because the URL alone must never be
 * enough to fetch it. Announcement images are on the public CDN by design, so
 * the delivery URL Cloudinary returns is stable and safe to store — and storing
 * it means a list of ten announcements costs no signing work. The `public_id`
 * is kept beside it so the asset remains addressable for deletion.
 *
 * Validated in the browser for ergonomics and AGAIN in the server action, with
 * this same schema. The second one is the control (§3.3).
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

export const announcementImage = z.object({
  publicId: required('Image'),
  /**
   * Bounded to Cloudinary. The browser sends this back after uploading, which
   * makes it request-controlled input — and an unchecked URL here would render
   * an `<img src>` pointing anywhere on a screen every employee sees.
   */
  url: z
    .string()
    .trim()
    .url('Image URL is not valid.')
    .refine(
      (value) => /^https:\/\/res\.cloudinary\.com\//.test(value),
      'Images must be uploaded through this form.',
    ),
  fileName: z.string().trim().max(200),
});

export type AnnouncementImageInput = z.infer<typeof announcementImage>;

/** RBAC.xls asks for announcements, not articles. Four images is a post, not a gallery. */
export const MAX_ANNOUNCEMENT_IMAGES = 4;

export const announcementSchema = z.object({
  title: required('Title').max(120),
  body: required('Details').max(4000),
  /**
   * Optional. "Upload announcement, project details" covers both a post about
   * Emerald Park and a company notice about none of them, and forcing a project
   * onto the second kind would file it somewhere untrue.
   */
  projectId: z.string().trim().max(20).optional().or(z.literal('')),
  images: z.array(announcementImage).max(MAX_ANNOUNCEMENT_IMAGES, {
    message: `At most ${MAX_ANNOUNCEMENT_IMAGES} images.`,
  }),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
