import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
  toSession,
  verifySessionCookie,
} from '@sfsr/infrastructure/server';

/**
 * Session exchange for the Internal Management System.
 *
 * The browser signs in with Firebase directly — the password never reaches
 * this server — then posts the resulting ID token here. We verify it, confirm
 * it belongs to an EMPLOYEE, and issue an httpOnly session cookie.
 *
 * The employee check is the important part: a client account holding a valid
 * Firebase token for the same project must not be able to open the internal
 * system just by having signed in on the Portal.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  let idToken: string;
  try {
    const body = (await request.json()) as { idToken?: unknown };
    if (typeof body.idToken !== 'string' || body.idToken.length === 0) {
      return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
    }
    idToken = body.idToken;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const cookie = await createSessionCookie(idToken).catch(() => null);
  if (!cookie) {
    return NextResponse.json({ error: 'Sign-in failed.' }, { status: 401 });
  }

  const decoded = await verifySessionCookie(cookie);
  const session = decoded ? toSession(decoded) : null;

  if (!session || session.kind !== 'employee') {
    // A valid Firebase user, but not staff. Deliberately vague to the caller.
    return NextResponse.json(
      { error: 'This account cannot access the Internal Management System.' },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    employeeId: session.employeeId,
    role: session.role,
    isSupervisor: session.isSupervisor,
    mustChangePassword: session.mustChangePassword,
  });

  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    // The LAN server runs over plain HTTP until a certificate is added
    // (Development Plan.md §12.23), so this cannot be hard-coded to true.
    secure: process.env.NODE_ENV === 'production' && process.env.SFSR_LAN_HTTP !== 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

/** Sign out. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
