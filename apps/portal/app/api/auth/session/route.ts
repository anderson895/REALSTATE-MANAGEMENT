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
  // Defaults to false: an absent flag means the caller did not ask to be
  // remembered, and the safe reading of silence is the shorter session.
  let remember = false;
  try {
    const body = (await request.json()) as { idToken?: unknown; remember?: unknown };
    if (typeof body.idToken !== 'string' || body.idToken.length === 0) {
      return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
    }
    idToken = body.idToken;
    remember = body.remember === true;
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
    /*
     * "Remember me", which until now was a checkbox that did nothing.
     *
     * The login form has always drawn it, defaulted it to ticked, and never
     * sent it — and this route never read it, so `maxAge` was set
     * unconditionally. Anyone leaving it ticked got what they expected, which
     * is why it went unnoticed.
     *
     * The case that matters is the other one. A buyer who UNTICKS it is on a
     * shared machine — a computer shop, a relative's laptop — and was told the
     * session would end with the browser. It did not: they got five days, and
     * the next person to open that browser was signed in as them, with their
     * reservations, their documents and their government ID on file.
     *
     * Without maxAge the cookie is a session cookie and dies with the browser.
     * The Firebase session cookie inside it is still minted with the five-day
     * lifetime either way, so ticking the box extends nothing the token did not
     * already allow. Same treatment as the Internal app, which got this right.
     */
    ...(remember ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
  });

  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
