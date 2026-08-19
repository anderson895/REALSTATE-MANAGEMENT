import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth, getAdminFirestore } from '../firebase/admin';

/**
 * Username-based authentication — SERVER ONLY.
 *
 * Both the Registration and Login pages in RESERVATION.doc specify a
 * **username**, not an email. Firebase Authentication requires an email, so a
 * private `usernames/{username}` index bridges the two.
 *
 * The index is unreadable from any browser (`allow read, write: if false` in
 * firestore.rules), so it cannot be enumerated to harvest registered accounts.
 * Resolution therefore has to happen here, under the Admin SDK.
 *
 * See Development Plan.md §5.2.
 */

export const SESSION_COOKIE = 'sfsr_session';

/** Five days, the maximum Firebase allows for a session cookie. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export interface UsernameRecord {
  readonly email: string;
  readonly uid: string;
  readonly kind: 'employee' | 'client';
}

export async function resolveUsername(username: string): Promise<UsernameRecord | null> {
  const key = username.trim().toLowerCase();
  if (key.length === 0) return null;

  const snap = await getAdminFirestore().collection('usernames').doc(key).get();
  if (!snap.exists) return null;

  const data = snap.data();
  if (!data?.email || !data?.uid) return null;

  return {
    email: String(data.email),
    uid: String(data.uid),
    kind: data.kind === 'employee' ? 'employee' : 'client',
  };
}

/**
 * The other direction: an address, back to the username registered against it.
 *
 * comments.doc asked for it outright — "Do we have password retrieval pag
 * nakalimutan ni prospect buyer/buyer ang password? ... same din sa username."
 * Password reset already existed. This did not, and its absence was the sharper
 * gap: sign-in takes a USERNAME, so a buyer who has forgotten that cannot use
 * the password reset either. The client had already worked out where it ends —
 * "no need gumawa ng another account" — and a second account for the same
 * person is a second master file for Documentation to reconcile.
 *
 * ── Clients only ─────────────────────────────────────────────────────────
 *
 * Employee usernames are never returned. Staff credentials are I.T's to
 * maintain — RESERVATION.doc and INTERNAL.xls both say so — and the buyer
 * portal must not become a way to enumerate staff accounts by trying company
 * addresses against it.
 *
 * ── Why it returns a list ────────────────────────────────────────────────
 *
 * Nothing in the schema stops two usernames sharing an address: `usernames` is
 * keyed by username, so what it enforces is the uniqueness of the username, not
 * of the email. Returning only the first match would send half an answer to
 * someone who then cannot sign in with it.
 */
export async function findClientUsernamesByEmail(email: string): Promise<string[]> {
  const key = email.trim().toLowerCase();
  if (key.length === 0) return [];

  const snap = await getAdminFirestore()
    .collection('usernames')
    .where('email', '==', key)
    .limit(10)
    .get();

  // `kind` is filtered here rather than in the query so this needs no composite
  // index — an equality on `email` alone is served by the automatic one.
  return snap.docs
    .filter((doc) => doc.data().kind !== 'employee')
    .map((doc) => doc.id)
    .sort();
}

/**
 * Exchanges a freshly minted Firebase ID token for a session cookie.
 *
 * A session cookie is used rather than passing the ID token around because it
 * is httpOnly — script on the page cannot read it — and it can be revoked
 * server-side, which an ID token cannot.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
}

/**
 * Verifies a session cookie and returns its claims.
 *
 * `checkRevoked: true` costs an extra lookup but means a disabled account
 * stops working immediately rather than at cookie expiry — which matters when
 * the account being disabled is an employee who has just left.
 */
export async function verifySessionCookie(cookie: string): Promise<DecodedIdToken | null> {
  try {
    return await getAdminAuth().verifySessionCookie(cookie, true);
  } catch {
    return null;
  }
}

export interface EmployeeSession {
  readonly kind: 'employee';
  readonly uid: string;
  readonly employeeId: string;
  readonly displayName: string;
  readonly username: string;
  readonly role: string;
  readonly department: string;
  readonly isSupervisor: boolean;
  readonly mustChangePassword: boolean;
}

export interface ClientSession {
  readonly kind: 'client';
  readonly uid: string;
  readonly displayName: string;
  readonly username: string;
  readonly tier: 'INITIAL' | 'PERMANENT';
}

export type Session = EmployeeSession | ClientSession;

/**
 * Reads the signed-in person's name off the token.
 *
 * Firebase copies a user's `displayName` into the ID token as the standard
 * `name` claim, so this costs nothing — no Firestore read to find out who is
 * looking at the page. Both the registration route and the employee seed set
 * `displayName`, so it is populated for every account the system creates.
 *
 * Falls back to the username, then to a generic label, so the UI never renders
 * an empty string where a name belongs.
 */
function nameFrom(token: DecodedIdToken, fallback: string): string {
  const name = typeof token.name === 'string' ? token.name.trim() : '';
  if (name.length > 0) return name;

  const username = typeof token.username === 'string' ? token.username.trim() : '';
  return username.length > 0 ? username : fallback;
}

/** Shapes a verified token into the session the apps actually use. */
export function toSession(token: DecodedIdToken): Session | null {
  const username = typeof token.username === 'string' ? token.username : '';

  if (token.kind === 'employee') {
    return {
      kind: 'employee',
      uid: token.uid,
      employeeId: String(token.employeeId ?? ''),
      displayName: nameFrom(token, String(token.employeeId ?? 'Staff')),
      username,
      role: String(token.role ?? ''),
      department: String(token.department ?? ''),
      isSupervisor: token.isSupervisor === true,
      mustChangePassword: token.mustChangePassword === true,
    };
  }
  if (token.kind === 'client') {
    return {
      kind: 'client',
      uid: token.uid,
      displayName: nameFrom(token, 'My Account'),
      username,
      tier: token.tier === 'PERMANENT' ? 'PERMANENT' : 'INITIAL',
    };
  }
  return null;
}
