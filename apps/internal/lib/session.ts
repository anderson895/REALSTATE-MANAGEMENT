import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  toSession,
  verifySessionCookie,
  type EmployeeSession,
} from '@sfsr/infrastructure/server';
import { canAccessModule, isInternalRole, type InternalActor, type Module } from '@sfsr/domain';

/**
 * Server-side session access for the Internal system.
 *
 * Layer 2 of three (Development Plan.md §3.3). `proxy.ts` only checks that a
 * cookie exists; this verifies its signature and its claims. Every page and
 * route handler that touches data must call `requireEmployee()`.
 */

export async function getEmployeeSession(): Promise<EmployeeSession | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const decoded = await verifySessionCookie(cookie);
  if (!decoded) return null;

  const session = toSession(decoded);
  return session?.kind === 'employee' ? session : null;
}

export async function requireEmployee(): Promise<EmployeeSession> {
  const session = await getEmployeeSession();
  if (!session) redirect('/login');
  return session;
}

/** Turns a session into the actor the RBAC matrix expects. */
export function toActor(session: EmployeeSession): InternalActor {
  if (!isInternalRole(session.role)) {
    // An unrecognised role is a seeding fault, not a permission to improvise.
    throw new Error(
      `Employee ${session.employeeId} has an unrecognised role "${session.role}". Re-run npm run seed:load.`,
    );
  }
  return { role: session.role, isSupervisor: session.isSupervisor };
}

/** Guards a page behind a module grant. Redirects rather than rendering empty. */
export async function requireModule(module: Module): Promise<EmployeeSession> {
  const session = await requireEmployee();
  if (!canAccessModule(toActor(session), module)) {
    redirect('/?denied=' + encodeURIComponent(module));
  }
  return session;
}
