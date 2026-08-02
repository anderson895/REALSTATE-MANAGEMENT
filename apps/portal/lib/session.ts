import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  toSession,
  verifySessionCookie,
  type ClientSession,
} from '@sfsr/infrastructure/server';
import { clientCan, type ClientCapability, type ClientTier } from '@sfsr/domain';

/**
 * Server-side session access for the Portal.
 *
 * Layer 2 of three (Development Plan.md §3.3). `proxy.ts` only checks that a
 * cookie exists on protected paths; this verifies its signature and claims.
 *
 * A visitor with no session is a GUEST — not an error. RESERVATION.doc grants
 * a Guest User "View all project details, create account", so most of this
 * site is deliberately reachable without signing in.
 */

export async function getClientSession(): Promise<ClientSession | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const decoded = await verifySessionCookie(cookie);
  if (!decoded) return null;

  const session = toSession(decoded);
  return session?.kind === 'client' ? session : null;
}

/** GUEST when signed out, otherwise the tier from the token. */
export async function getTier(): Promise<ClientTier> {
  const session = await getClientSession();
  return session?.tier ?? 'GUEST';
}

export async function requireClient(): Promise<ClientSession> {
  const session = await getClientSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * Guards a page behind a client capability.
 *
 * An Initial Account may reserve a unit but may not view an SOA — that arrives
 * with the Permanent Account after the Contract to Sell is signed.
 */
export async function requireCapability(capability: ClientCapability): Promise<ClientSession> {
  const session = await requireClient();
  if (!clientCan(session.tier, capability)) {
    redirect('/dashboard?denied=' + encodeURIComponent(capability));
  }
  return session;
}
