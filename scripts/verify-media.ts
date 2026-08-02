/**
 * Read-only check of the uploaded project media.
 *
 *   node --env-file=.env.local --import tsx scripts/verify-media.ts
 */
import { v2 as cloudinary } from 'cloudinary';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

async function main(): Promise<void> {
  const res = await cloudinary.api.resources({
    type: 'upload',
    prefix: 'sfsr/projects',
    max_results: 100,
  });

  console.log(`── Cloudinary: sfsr/projects — ${res.resources.length} asset(s) ──\n`);
  const sorted = [...res.resources].sort((a, b) =>
    String(a.public_id).localeCompare(String(b.public_id)),
  );
  for (const r of sorted) {
    console.log(
      `  ${String(r.public_id).padEnd(48)} ${r.width}x${r.height} ${Math.round((r.bytes ?? 0) / 1024)}KB`,
    );
  }

  const usage = await cloudinary.api.usage();
  console.log(
    `\n  storage ${(usage.storage.usage / 1024 / 1024).toFixed(1)} MB · credits used ${usage.credits?.used_percent ?? 0}%`,
  );

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }

  console.log('\n── Firestore: URLs wired onto projects ──\n');
  const projects = await getFirestore().collection('projects').get();
  for (const doc of projects.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const data = doc.data();
    const plans = Object.keys((data.floorPlans ?? {}) as Record<string, string>);
    console.log(
      `  ${doc.id}  hero=${data.heroImageUrl ? 'yes' : 'NO '}  floorPlans=${plans.length}` +
        (plans.length ? `  [${plans.join(', ')}]` : ''),
    );
  }
}

void main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
