/**
 * Read-only survey of what already exists in the sfsr-rems Firebase project.
 *
 *   node --env-file=.env.local --import tsx scripts/inspect-firebase.ts
 *
 * Run before seeding so existing data is never silently overwritten.
 * Writes nothing. Redacts identifying values.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function mask(value: string | undefined): string {
  if (!value) return '(none)';
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }

  console.log('── Firebase Auth users ──────────────────────────');
  const { users } = await getAuth().listUsers(100);
  console.log(`  total: ${users.length}\n`);
  for (const u of users) {
    const claims = u.customClaims ?? {};
    console.log(
      `  ${mask(u.email ?? u.uid).padEnd(14)} ` +
        `created=${u.metadata.creationTime?.slice(0, 16) ?? '?'} ` +
        `lastSignIn=${u.metadata.lastSignInTime?.slice(0, 16) ?? 'never'} ` +
        `claims=${Object.keys(claims).length ? JSON.stringify(claims) : '{}'} ` +
        `disabled=${u.disabled}`,
    );
  }

  console.log('\n── Firestore collections ────────────────────────');
  const db = getFirestore();
  const collections = await db.listCollections();
  if (collections.length === 0) {
    console.log('  (empty)');
  }
  for (const col of collections) {
    const snap = await col.limit(5).get();
    const total = await col.count().get();
    console.log(`\n  /${col.id}  —  ${total.data().count} document(s)`);
    snap.forEach((doc) => {
      const fields = Object.keys(doc.data());
      console.log(`     ${doc.id.slice(0, 24).padEnd(26)} fields: ${fields.join(', ') || '(none)'}`);
    });
  }
  console.log('\n─────────────────────────────────────────────────');
  console.log('Read-only survey complete. Nothing was modified.');
}

void main();
