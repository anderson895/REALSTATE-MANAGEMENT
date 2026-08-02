/**
 * Backfills the `username` custom claim on accounts created before it existed.
 *
 *   node --env-file=.env.local --import tsx scripts/backfill-username-claims.ts [--dry-run]
 *
 * The sidebar reads the signed-in person's username off the session token so
 * it can show "@name" without a Firestore read. Accounts registered before
 * that claim was added carry an empty one, so their sidebar renders without
 * it — harmless, but inconsistent.
 *
 * The authoritative username lives on `clients/{uid}` (and `employees/{id}`),
 * so this reconciles the claim from the stored record rather than guessing.
 *
 * Idempotent: accounts that already have a matching claim are skipped.
 *
 * NOTE: a custom claim only reaches a browser on the next token refresh.
 * Anyone already signed in must sign out and back in to see the change.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');

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

  const auth = getAuth();
  const db = getFirestore();

  console.log(`Backfilling username claims${DRY_RUN ? '  (DRY RUN)' : ''}\n`);

  // uid -> username, from whichever collection owns the account.
  const byUid = new Map<string, string>();

  for (const doc of (await db.collection('clients').get()).docs) {
    const username = String(doc.data().username ?? '').trim();
    if (username) byUid.set(doc.id, username);
  }
  for (const doc of (await db.collection('employees').get()).docs) {
    const uid = String(doc.data().uid ?? '');
    const username = String(doc.data().username ?? '').trim();
    if (uid && username) byUid.set(uid, username);
  }

  const { users } = await auth.listUsers(1000);
  let updated = 0;
  let alreadyCorrect = 0;
  let noRecord = 0;

  for (const user of users) {
    const claims = user.customClaims ?? {};
    const current = typeof claims.username === 'string' ? claims.username : '';
    const expected = byUid.get(user.uid);

    if (!expected) {
      // An Auth user with no profile document. Left alone rather than
      // invented — a claim guessed from an email prefix would be wrong the
      // first time someone's username differs from it.
      console.log(`  SKIP    ${user.email} — no clients/ or employees/ record`);
      noRecord++;
      continue;
    }

    if (current === expected) {
      alreadyCorrect++;
      continue;
    }

    console.log(`  UPDATE  ${user.email}  "${current}" -> "${expected}"`);
    if (!DRY_RUN) {
      await auth.setCustomUserClaims(user.uid, { ...claims, username: expected });
    }
    updated++;
  }

  console.log(
    `\n${updated} updated, ${alreadyCorrect} already correct, ${noRecord} without a profile record`,
  );
  if (updated > 0 && !DRY_RUN) {
    console.log('\nAffected users must sign out and back in — a custom claim only');
    console.log('reaches the browser on the next token refresh.');
  }
}

void main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
