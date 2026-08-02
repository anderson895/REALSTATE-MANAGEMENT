/**
 * Side-by-side, read-only comparison of the two Firebase projects.
 *
 *   node --env-file=.env.local --import tsx scripts/compare-projects.ts
 *
 * Reads both the original `sfsr-rems` (via its service account JSON, still in
 * the repo root and gitignored) and the current `sfsr-rems-next`. Writes
 * nothing to either.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = join(import.meta.dirname, '..');

interface Target {
  readonly label: string;
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
}

function fromKeyFile(label: string, filename: string): Target | null {
  const path = join(ROOT, filename);
  if (!existsSync(path)) return null;
  const sa = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
  return {
    label,
    projectId: sa.project_id!,
    clientEmail: sa.client_email!,
    privateKey: sa.private_key!,
  };
}

async function survey(target: Target): Promise<void> {
  let app: App | undefined;
  try {
    app = initializeApp(
      {
        credential: cert({
          projectId: target.projectId,
          clientEmail: target.clientEmail,
          privateKey: target.privateKey,
        }),
      },
      `survey-${target.projectId}`,
    );

    const [users, collections] = await Promise.all([
      getAuth(app).listUsers(1000),
      getFirestore(app).listCollections(),
    ]);

    console.log(`\n── ${target.label} (${target.projectId}) ──`);
    console.log(`  Auth users: ${users.users.length}`);

    const withClaims = users.users.filter(
      (u) => Object.keys(u.customClaims ?? {}).length > 0,
    ).length;
    console.log(`    with RBAC custom claims: ${withClaims}`);

    const signedIn = users.users.filter((u) => u.metadata.lastSignInTime).length;
    console.log(`    have signed in at least once: ${signedIn}`);

    if (collections.length === 0) {
      console.log('  Firestore: (empty)');
      return;
    }

    console.log(`  Firestore collections: ${collections.length}`);
    let total = 0;
    for (const col of collections.sort((a, b) => a.id.localeCompare(b.id))) {
      const count = (await getFirestore(app).collection(col.id).count().get()).data().count;
      total += count;
      console.log(`    /${col.id.padEnd(16)} ${String(count).padStart(4)} document(s)`);
    }
    console.log(`  total documents: ${total}`);
  } catch (error) {
    console.log(`\n── ${target.label} (${target.projectId}) ──`);
    console.log(`  unreachable: ${(error as Error).message}`);
  } finally {
    if (app) await deleteApp(app).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const targets: Target[] = [];

  const oldProject = fromKeyFile('ORIGINAL — prior implementation', 'sfsr-rems-firebase-adminsdk-fbsvc-ed57df627f.json');
  if (oldProject) targets.push(oldProject);

  const newProject = fromKeyFile('CURRENT — this build', 'sfsr-rems-next-firebase-adminsdk-fbsvc-39c8d922ca.json');
  if (newProject) targets.push(newProject);

  if (targets.length === 0) {
    console.log('No service account key files found in the repo root.');
    return;
  }

  console.log('Read-only survey of both Firebase projects. Nothing is modified.');
  for (const target of targets) {
    await survey(target);
  }

  console.log(
    `\n─────────────────────────────────────────────\n` +
      `.env.local currently points at: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`,
  );
}

void main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
