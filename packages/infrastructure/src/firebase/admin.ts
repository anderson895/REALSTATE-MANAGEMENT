import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getServerConfig } from '../config';

/**
 * Firebase Admin SDK — SERVER ONLY.
 *
 * This credential bypasses every Firestore Security Rule. Importing this file
 * from a client component is a build error in Next.js because the variables it
 * reads are absent from the browser bundle; that is the intended behaviour.
 *
 * Shared by both apps: a service account is scoped to the Firebase project,
 * not to an app registration. See Development Plan.md §12.27 on splitting this
 * into two least-privilege accounts before real production use.
 */

let cachedApp: App | undefined;

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  // Next.js hot-reload re-executes modules; reuse the app rather than
  // re-initialising, which throws on a duplicate name.
  const existing = getApps();
  if (existing.length > 0 && existing[0]) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const { firebaseAdmin } = getServerConfig();
  cachedApp = initializeApp({
    credential: cert({
      projectId: firebaseAdmin.projectId,
      clientEmail: firebaseAdmin.clientEmail,
      privateKey: firebaseAdmin.privateKey,
    }),
  });
  return cachedApp;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
