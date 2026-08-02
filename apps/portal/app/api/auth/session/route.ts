import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
  toSession,
  verifySessionCookie,
} from '@sfsr/infrastructure/server';

/**
 * Session exchange for the buyer Portal.
 *
 * Mirror of the Internal route, with the check inverted: this one accepts
 * CLIENT tokens and rejects employees. Staff credentials must not open the
 * public portal as a customer, and a customer must not open the internal
 * system — the two checks together keep the audiences separate even though
 * they share one Firebase project (§5.7).
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

  if (!session || session.kind !== 'client') {
    return NextResponse.json(
      { error: 'This account cannot access the Client Portal.' },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true, tier: session.tier });

  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
