/**
 * Uploads project renders and floor plans to Cloudinary, then wires the URLs
 * onto the `projects` documents.
 *
 *   node --env-file=.env.local --import tsx scripts/seed/upload-media.ts [--dry-run]
 *
 * These are marketing assets, so they use `type: 'upload'` — the public CDN.
 * Government IDs, receipts and contracts go to `type: 'authenticated'` with
 * signed URLs instead (Development Plan.md §2.4). Do not extend this script to
 * carry those.
 *
 * Idempotent: fixed `public_id` values plus `overwrite`, so a second run
 * replaces rather than duplicating.
 *
 * The source filenames are inconsistent — "STUDIO-EMERALPARK.png" (missing D),
 * "STUDIO.png" with no project suffix, "GRAND VERDANT.png" with a space. They
 * are mapped explicitly below rather than parsed; a parser would silently
 * mis-file the odd ones.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';
import { UNIT_TYPES, type UnitType } from '@sfsr/domain';

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_ROOT = join(import.meta.dirname, '..', '..', 'CONDOMINIUM PROJECTS');

interface ProjectMedia {
  readonly projectId: string;
  readonly folder: string;
  readonly hero: string | null;
  /** Only the unit types that actually have a plan on disk. */
  readonly floorPlans: Partial<Record<UnitType, string>>;
  /**
   * The client's "Amenities & Facilities" poster, as a path relative to
   * SOURCE_ROOT rather than to `folder`.
   *
   * These arrived later and all sit together in `new/`, not in the per-project
   * folders — and their names are Facebook export ids, so nothing about
   * "773508367_801866502988682_..." says which project it belongs to. They are
   * mapped by eye, from the project name printed on each poster.
   *
   * The page renders the structured `amenities` list from
   * projects-content.json as well as this image, deliberately: the poster is a
   * wide desktop graphic whose labels are baked into the pixels, so on a phone
   * it is decoration and the list is the content.
   */
  readonly amenities: string | null;
}

const MEDIA: readonly ProjectMedia[] = [
  {
    // The Legaspi Place still has no floor plans and no render of its own
    // (§12.10) — the amenities poster below is the first asset it has ever had.
    projectId: 'TLP001',
    folder: '',
    hero: null,
    floorPlans: {},
    amenities: 'new/768358017_837576299444938_1702286669090552636_n.png',
  },
  {
    projectId: 'EPR002',
    folder: 'EMERALDPARK FLOOR PLAN',
    hero: 'EMERALD PARK.png',
    floorPlans: {
      Studio: 'STUDIO-EMERALPARK.png',
      'One Bedroom': '1BR-EMERALDPARK.png',
      'Two Bedroom': '2BR-EMERALDPARK.png',
      'Three Bedroom': '3BR-EMERALDPARK.png',
    },
    amenities: 'new/772663524_1786017318985338_7123392930329951427_n.png',
  },
  {
    projectId: 'SQR003',
    folder: 'SKYLINE QUARTER',
    hero: 'SKYLINE.png',
    floorPlans: {
      Studio: 'STUDIO-SKYLINE.png',
      'One Bedroom': '1BR-SKYLINE.png',
      'Two Bedroom': '2BR-SKYLINE.png',
      'Three Bedroom': '3BR-SKYLINE.png',
    },
    amenities: 'new/773290687_973740899055986_1377260956167178773_n.png',
  },
  {
    projectId: 'GVR004',
    folder: 'GRAND VERDANT',
    hero: 'GRAND VERDANT.png',
    floorPlans: {
      Studio: 'STUDIO-GRANDVERDANT.png',
      'One Bedroom': '1BR-GRANDVERDANT.png',
      'Two Bedroom': '2BR-GRANDVERDANT.png',
      'Three Bedroom': '3BR-GRANDVERDANT.png',
    },
    amenities: 'new/773508367_801866502988682_5578232515397658329_n.png',
  },
  {
    projectId: 'HPR004',
    folder: 'HARBOR POINT',
    hero: 'HARBOR POINT.png',
    floorPlans: {
      Studio: 'STUDIO.png',
      'One Bedroom': '1BR-HARBORPOINT.png',
      'Two Bedroom': '2BR-HARBORPOINT.png',
      // No 3BR plan on disk, although the project sells Three Bedroom units (§12.11).
    },
    amenities: 'new/771892037_2001826807352062_9174657905878584655_n.png',
  },
];

/** `Three Bedroom` -> `three-bedroom`, for use in a Cloudinary public_id. */
function slug(unitType: string): string {
  return unitType.toLowerCase().replace(/\s+/g, '-');
}

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  });
}

async function upload(localPath: string, publicId: string): Promise<string> {
  if (DRY_RUN) return `https://res.cloudinary.com/DRY-RUN/${publicId}`;
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    type: 'upload', // public CDN — marketing assets only
  });
  return result.secure_url;
}

async function main(): Promise<void> {
  initAdmin();
  const db = getFirestore();

  console.log(
    `Uploading project media -> ${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}` +
      `${DRY_RUN ? '  (DRY RUN)' : ''}\n`,
  );

  let uploaded = 0;
  let missing = 0;
  let bytes = 0;

  for (const project of MEDIA) {
    console.log(`── ${project.projectId} ${project.folder ? `(${project.folder})` : '(no assets)'}`);

    const base = project.folder ? join(SOURCE_ROOT, project.folder) : '';
    let heroUrl: string | null = null;
    const planUrls: Partial<Record<UnitType, string>> = {};

    if (project.hero && base) {
      const path = join(base, project.hero);
      if (existsSync(path)) {
        bytes += statSync(path).size;
        heroUrl = await upload(path, `sfsr/projects/${project.projectId}/hero`);
        uploaded++;
        console.log(`   hero          ${project.hero}`);
      } else {
        console.log(`   hero          MISSING: ${project.hero}`);
        missing++;
      }
    }

    for (const [unitType, filename] of Object.entries(project.floorPlans)) {
      const path = join(base, filename);
      if (!existsSync(path)) {
        console.log(`   ${unitType.padEnd(14)}MISSING: ${filename}`);
        missing++;
        continue;
      }
      bytes += statSync(path).size;
      planUrls[unitType as UnitType] = await upload(
        path,
        `sfsr/projects/${project.projectId}/floorplans/${slug(unitType)}`,
      );
      uploaded++;
      console.log(`   ${unitType.padEnd(14)}${filename}`);
    }

    // Relative to SOURCE_ROOT, not `base` — the posters live in one shared
    // folder, and TLP001 has no `folder` of its own to be relative to.
    let amenitiesUrl: string | null = null;
    if (project.amenities) {
      const path = join(SOURCE_ROOT, project.amenities);
      if (existsSync(path)) {
        bytes += statSync(path).size;
        amenitiesUrl = await upload(path, `sfsr/projects/${project.projectId}/amenities`);
        uploaded++;
        console.log(`   amenities     ${project.amenities}`);
      } else {
        console.log(`   amenities     MISSING: ${project.amenities}`);
        missing++;
      }
    }

    if (!DRY_RUN) {
      await db.collection('projects').doc(project.projectId).set(
        {
          heroImageUrl: heroUrl,
          floorPlans: planUrls,
          amenitiesImageUrl: amenitiesUrl,
          mediaUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  // ── Coverage report ────────────────────────────────────────────────────
  // Which units will render without a floor plan, and how many buyers that
  // affects. Findings §12.10 and §12.11 are easier to act on with numbers.
  console.log('\n── Floor plan coverage ──────────────────────────');
  const units = await db.collection('units').get();
  const gaps = new Map<string, number>();

  for (const doc of units.docs) {
    const data = doc.data();
    const projectId = String(data.projectId);
    const unitType = String(data.unitType);
    const project = MEDIA.find((m) => m.projectId === projectId);
    const covered = project?.floorPlans[unitType as UnitType] !== undefined;
    if (!covered) {
      const key = `${projectId} · ${unitType}`;
      gaps.set(key, (gaps.get(key) ?? 0) + 1);
    }
  }

  const affected = [...gaps.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${units.size - affected} of ${units.size} units have a floor plan`);
  if (gaps.size > 0) {
    console.log(`  ${affected} units without one:`);
    for (const [key, count] of [...gaps.entries()].sort()) {
      console.log(`     ${key.padEnd(30)} ${count} unit(s)`);
    }
  }

  const unusedTypes = UNIT_TYPES.filter((t) => !MEDIA.some((m) => m.floorPlans[t]));
  if (unusedTypes.length > 0) {
    console.log(`  unit types with NO plan in any project: ${unusedTypes.join(', ')}`);
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log(
    `${uploaded} uploaded (${(bytes / 1024 / 1024).toFixed(1)} MB), ${missing} missing` +
      `${DRY_RUN ? '  — DRY RUN, nothing written' : ''}`,
  );
}

void main().catch((error: unknown) => {
  console.error('\nUPLOAD FAILED:', (error as Error).message);
  process.exit(1);
});
