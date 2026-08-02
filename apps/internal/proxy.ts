import { NextResponse, type NextRequest } from 'next/server';

/**
 * Request gate for the Internal Management System.
 *
 * Layer 1 of three (Development Plan.md §3.3). It rejects anyone without an
 * employee session before a page renders. It does NOT decide what that
 * employee may do — that is `can()` in the route handler, backed by Firestore
 * Security Rules. Treat this as a coarse filter, never as the control.
 *
 * Next.js 16 renamed this convention: `middleware.ts` is deprecated in favour
 * of `proxy.ts` (§2.1).
 */

/**
 * `/api/auth` must be here: it is how a session is obtained in the first
 * place. Gating it redirects the sign-in POST to /login, which only answers
 * GET — a 405 that looks like a broken route rather than a locked door.
 * The route verifies the ID token itself and rejects non-employees.
 */
const PUBLIC_PATHS = ['/login', '/reset-password', '/api/auth'];

/** Cookie set by the sign-in route after verifying the Firebase ID token. */
const SESSION_COOKIE = 'sfsr_session';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  // The cookie's signature and its employee claim are verified server-side in
  // the route handler using the Admin SDK. The Edge runtime cannot do that
  // here, so presence is all this layer checks — hence "coarse filter".
  //
  // Server Components cannot read the current URL, so pass it down for the
  // sidebar's active-item highlight.
  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
};
