import { NextResponse, type NextRequest } from 'next/server';

/**
 * Request gate for the Web-Based Real Estate Portal.
 *
 * Unlike the Internal app, most of this site is deliberately public: a Guest
 * User may "View all project details, create account" per RESERVATION.doc.
 * Only the client dashboard and the reservation flow need a session.
 *
 * Layer 1 of three (Development Plan.md §3.3). Tier checks — Initial vs
 * Permanent — happen in the route handlers via `clientCan()`, because this
 * layer cannot verify a token signature on the Edge runtime.
 */

/** Paths a Guest User may reach without signing in. */
const PUBLIC_PREFIXES = [
  '/',
  '/projects',
  '/units',
  '/compute', // sample computation is open to guests
  '/login',
  '/register',
  '/reset-password',
  '/terms',
  '/privacy',
];

/** Paths that require at least an Initial Account. */
const AUTHENTICATED_PREFIXES = ['/dashboard', '/reserve', '/tripping'];

const SESSION_COOKIE = 'sfsr_session';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Server Components cannot read the current URL, so pass it down for the
  // sidebar's active-item highlight.
  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);

  const needsSession = AUTHENTICATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsSession) {
    return NextResponse.next({ request: { headers } });
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
};

/** Exported for the route-coverage test. */
export const PUBLIC_PATH_PREFIXES = PUBLIC_PREFIXES;
export const PROTECTED_PATH_PREFIXES = AUTHENTICATED_PREFIXES;
