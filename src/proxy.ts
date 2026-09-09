import { NextResponse, type NextRequest } from 'next/server';
export function proxy(request: NextRequest) {
  const publicRoute = ['/login', '/auth/callback', '/api/auth/session'].includes(request.nextUrl.pathname);
  // Presence only optimizes navigation. Data access verifies signature and authorization.
  const response =
    !publicRoute && !request.cookies.has('pp5_session')
      ? NextResponse.redirect(new URL('/login', request.url))
      : NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|woff2)$).*)'],
};
