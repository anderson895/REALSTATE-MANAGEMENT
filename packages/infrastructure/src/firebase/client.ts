import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { publicConfig } from '../config';

/**
 * Firebase client SDK — browser side.
 *
 * Only ever used to sign in and hold a session. Every privileged read and
 * write goes through a server route using the Admin SDK, because the client
 * SDK is bound by Firestore Security Rules and the browser is not trusted.
 *
 * The web API key here is public by design; it identifies the project, it does
 * not authorise anything (Development Plan.md §2.4).
 */

const APP_NAME = 'sfsr-client';

export function getClientApp(): FirebaseApp {
  if (getApps().some((a) => a.name === APP_NAME)) {
    return getApp(APP_NAME);
  }
  const { firebase } = publicConfig;
  return initializeApp(
    {
      apiKey: firebase.apiKey,
      authDomain: firebase.authDomain,
      projectId: firebase.projectId,
      storageBucket: firebase.storageBucket,
      messagingSenderId: firebase.messagingSenderId,
      appId: firebase.appId,
    },
    APP_NAME,
  );
}

export function getClientAuth(): Auth {
  return getAuth(getClientApp());
}
