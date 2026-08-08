import { describe, expect, it } from 'vitest';
import {
  MAX_ANNOUNCEMENT_IMAGES,
  announcementSchema,
  type AnnouncementInput,
} from '../lib/announcements';

const image = (over: Record<string, unknown> = {}) => ({
  publicId: 'sfsr/announcements/EMP030/render-1770000000',
  url: 'https://res.cloudinary.com/demo/image/upload/v1/sfsr/announcements/render.png',
  fileName: 'render.png',
  ...over,
});

const post = (over: Partial<AnnouncementInput> = {}) => ({
  title: 'Emerald Park — new tower now selling',
  body: 'Reservations open Monday for tower B.',
  projectId: 'EPR002',
  images: [image()],
  ...over,
});

describe('announcementSchema', () => {
  it('accepts a post with a project and pictures', () => {
    expect(announcementSchema.safeParse(post()).success).toBe(true);
  });

  it('accepts a post about no project at all', () => {
    // "Upload announcement, project details" covers a company notice as well as
    // one about a building; forcing a project would file it somewhere untrue.
    expect(announcementSchema.safeParse(post({ projectId: '' })).success).toBe(true);
  });

  it('accepts a post with no pictures', () => {
    expect(announcementSchema.safeParse(post({ images: [] })).success).toBe(true);
  });

  it('requires a title and details', () => {
    expect(announcementSchema.safeParse(post({ title: '   ' })).success).toBe(false);
    expect(announcementSchema.safeParse(post({ body: '' })).success).toBe(false);
  });

  it('refuses an image URL that is not on Cloudinary', () => {
    /*
     * The single most important rule in this schema.
     *
     * `url` arrives from the BROWSER after it has uploaded, which makes it
     * request-controlled input that ends up in an `<img src>` on a screen every
     * employee sees. Without this bound, a crafted call to the server action
     * could point that tag at any host — an off-site tracker, or something
     * worse — with a Marketing session and no upload ever taking place.
     */
    const offsite = post({ images: [image({ url: 'https://evil.example.com/a.png' })] });
    expect(announcementSchema.safeParse(offsite).success).toBe(false);

    const notAUrl = post({ images: [image({ url: 'javascript:alert(1)' })] });
    expect(announcementSchema.safeParse(notAUrl).success).toBe(false);

    // Look-alike host — `res.cloudinary.com.evil.example.com` must not pass.
    const lookalike = post({
      images: [image({ url: 'https://res.cloudinary.com.evil.example.com/a.png' })],
    });
    expect(announcementSchema.safeParse(lookalike).success).toBe(false);
  });

  it('refuses a plain http Cloudinary URL', () => {
    const insecure = post({
      images: [image({ url: 'http://res.cloudinary.com/demo/image/upload/a.png' })],
    });
    expect(announcementSchema.safeParse(insecure).success).toBe(false);
  });

  it('caps the number of images', () => {
    const tooMany = post({
      images: Array.from({ length: MAX_ANNOUNCEMENT_IMAGES + 1 }, (_, i) =>
        image({ publicId: `sfsr/announcements/EMP030/render-${i}` }),
      ),
    });
    expect(announcementSchema.safeParse(tooMany).success).toBe(false);
  });

  it('trims what it stores', () => {
    const parsed = announcementSchema.parse(post({ title: '  Launch  ', body: ' Details ' }));
    expect(parsed.title).toBe('Launch');
    expect(parsed.body).toBe('Details');
  });
});
