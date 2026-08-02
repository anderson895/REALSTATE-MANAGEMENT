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
  readonly role: string;
  readonly department: string;
  readonly isSupervisor: boolean;
  readonly mustChangePassword: boolean;
}

export interface ClientSession {
  readonly kind: 'client';
  readonly uid: string;
  readonly tier: 'INITIAL' | 'PERMANENT';
}

export type Session = EmployeeSession | ClientSession;

/** Shapes a verified token into the session the apps actually use. */
export function toSession(token: DecodedIdToken): Session | null {
  if (token.kind === 'employee') {
    return {
      kind: 'employee',
      uid: token.uid,
      employeeId: String(token.employeeId ?? ''),
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
      tier: token.tier === 'PERMANENT' ? 'PERMANENT' : 'INITIAL',
    };
  }
  return null;
}
