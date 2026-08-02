/**
 * SFSR-REMS infrastructure — CLIENT-SAFE entry point.
 *
 * Only things that may legitimately reach a browser bundle live here: the
 * public Firebase config and the client SDK.
 *
 * Everything privileged — the Admin SDK, Firestore repositories, session
 * verification — is exported from `@sfsr/infrastructure/server` instead.
 *
 * The split is not cosmetic. A single barrel dragged `firebase-admin` (and
 * through it `google-gax` and `@grpc/grpc-js`, which need `fs` and `net`) into
 * the client build and broke it. Keeping the entry points apart makes
 * "did I just import a secret into the browser?" a build error rather than a
 * question (Development Plan.md §5.5).
 */

export { publicConfig } from './config';
export { getClientApp, getClientAuth } from './firebase/client';
