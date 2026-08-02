import { NextResponse, type NextRequest } from 'next/server';
import { resolveUsername } from '@sfsr/infrastructure/server';

/**
 * Username → email resolution for buyer sign-in.
 *
 * RESERVATION.doc specifies a username; Firebase Auth needs an email. Clients
 * register with their own address, so unlike staff it cannot be derived — a
 * lookup against the private `usernames` index is required.
 *
 * ANTI-ENUMERATION: an unknown username returns 200 with a synthetic address
 * rather than 404. Firebase then fails the sign-in with the same
 * `auth/invalid-credential` it returns for a wrong password, so the response
 * is indistinguishable either way. A 404 here would turn this endpoint into a
 * free "is this person a customer of St. Francis Square Realty?" oracle —
 * which is itself personal information under RA 10173.
 */

const UNRESOLVABLE_DOMAIN = 'no-such-account.invalid';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let username: string;
  try {
    const body = (await request.json()) as { username?: unknown };
    if (typeof body.username !== 'string') {
      return NextResponse.json({ error: 'Missing username.' }, { status: 400 });
    }
    username = body.username;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const key = username.trim().toLowerCase();
  const record = await resolveUsername(key);

  // Staff accounts must not be usable on the buyer portal.
  if (record && record.kind === 'client') {
    return NextResponse.json({ email: record.email });
  }

  // Deterministic so repeated attempts look identical, and unroutable.
  const synthetic = `${encodeURIComponent(key || 'unknown')}@${UNRESOLVABLE_DOMAIN}`;
  return NextResponse.json({ email: synthetic });
}
