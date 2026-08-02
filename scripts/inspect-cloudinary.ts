/**
 * Read-only survey of existing Cloudinary assets.
 *
 *   node --env-file=.env.local --import tsx scripts/inspect-cloudinary.ts
 *
 * Writes nothing, deletes nothing.
 */
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

async function main(): Promise<void> {
  console.log('── Folders ──────────────────────────────────────');
  try {
    const { folders } = await cloudinary.api.root_folders();
    console.log(folders.length ? folders.map((f) => `  /${f.path}`).join('\n') : '  (none)');
  } catch (e) {
    console.log(`  unavailable: ${(e as Error).message}`);
  }

  console.log('\n── Assets by delivery type ──────────────────────');
  for (const type of ['upload', 'authenticated', 'private'] as const) {
    try {
      const res = await cloudinary.api.resources({ type, max_results: 100 });
      console.log(`\n  type="${type}" — ${res.resources.length} asset(s)`);
      for (const r of res.resources.slice(0, 12)) {
        console.log(
          `     ${String(r.public_id).slice(0, 44).padEnd(46)} ` +
            `${r.format ?? '?'} ${Math.round((r.bytes ?? 0) / 1024)}KB ` +
            `${String(r.created_at).slice(0, 10)}`,
        );
      }
      if (res.resources.length > 12) console.log(`     … and ${res.resources.length - 12} more`);
    } catch (e) {
      console.log(`  type="${type}" unavailable: ${(e as Error).message}`);
    }
  }

  console.log('\n── Upload presets ───────────────────────────────');
  try {
    const { presets } = await cloudinary.api.upload_presets({ max_results: 50 });
    for (const p of presets) {
      console.log(`  ${String(p.name).padEnd(22)} unsigned=${p.unsigned}  folder=${p.settings?.folder ?? '(none)'}`);
    }
  } catch (e) {
    console.log(`  unavailable: ${(e as Error).message}`);
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log('Read-only survey complete. Nothing was modified.');
}

void main();
