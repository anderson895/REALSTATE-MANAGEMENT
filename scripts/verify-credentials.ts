/**
 * Verifies the credentials in .env.local actually authenticate.
 *
 *   node --env-file=.env.local --import tsx scripts/verify-credentials.ts
 *
 * Read-only: it authenticates and reads metadata. It creates nothing.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function verifyFirebase(): Promise<void> {
  console.log('\n── Firebase Admin ───────────────────────────────');
  const projectId = required('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  const clientEmail = required('FIREBASE_ADMIN_CLIENT_EMAIL');
  const privateKey = required('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n');

  console.log(`  project      : ${projectId}`);
  console.log(`  client email : ${clientEmail}`);
  console.log(`  key parsed   : ${privateKey.includes('BEGIN PRIVATE KEY') ? 'yes' : 'NO'}`);

  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  // Each service is checked independently. A disabled product and a bad
  // credential produce very different fixes, so one must not mask the other.
  let failures = 0;

  try {
    const users = await getAuth().listUsers(5);
    console.log(`  AUTH  OK     : ${users.users.length} existing user(s)`);
  } catch (error) {
    failures++;
    const message = (error as Error).message;
    console.log(`  AUTH  FAILED : ${message}`);
    if (/no configuration corresponding/i.test(message)) {
      console.log('     -> Authentication is not enabled on this project yet.');
      console.log(`     -> https://console.firebase.google.com/project/${projectId}/authentication`);
      console.log('        Get started -> Sign-in method -> Email/Password -> Enable');
    }
  }

  try {
    const collections = await getFirestore().listCollections();
    const names = collections.map((c) => c.id);
    console.log(
      `  STORE OK     : ${names.length} collection(s)` +
        (names.length ? ` — ${names.join(', ')}` : ' — empty, expected before seeding'),
    );
  } catch (error) {
    failures++;
    console.log(`  STORE FAILED : ${(error as Error).message}`);
  }

  if (failures > 0) {
    throw new Error(`${failures} Firebase service check(s) failed`);
  }
}

async function verifyCloudinary(): Promise<void> {
  console.log('\n── Cloudinary ───────────────────────────────────');
  const cloudName = required('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME');
  const apiKey = required('CLOUDINARY_API_KEY');
  const apiSecret = required('CLOUDINARY_API_SECRET');

  console.log(`  cloud name   : ${cloudName}`);
  console.log(`  api key      : ${apiKey}`);
  console.log(`  api secret   : <set, ${apiSecret.length} chars>`);

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const ping = await cloudinary.api.ping();
  console.log(`  PING OK      : ${ping.status}`);

  const usage = await cloudinary.api.usage();
  console.log(`  plan         : ${usage.plan}`);
  console.log(`  credits used : ${usage.credits?.used_percent ?? 0}%`);
}

async function main(): Promise<void> {
  let failed = false;

  for (const [label, check] of [
    ['Firebase', verifyFirebase],
    ['Cloudinary', verifyCloudinary],
  ] as const) {
    try {
      await check();
    } catch (error) {
      failed = true;
      console.error(`\n  ${label} FAILED: ${(error as Error).message}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log(failed ? 'RESULT: one or more checks FAILED' : 'RESULT: all credentials verified');
  process.exit(failed ? 1 : 0);
}

void main();
