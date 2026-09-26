import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE_NAME, verifyDemoToken } from '@/lib/demo-gate';

const PUBLIC_PATHS = ['/demo-login'];

// Runs outside the module graph lib/env.ts validates for, same as the other
// direct process.env reads a proxy needs — see conventions/security.md §2:
// this gate keeps the whole app off the public internet, checked before
// anything else runs.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.DEMO_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const token = request.cookies.get(DEMO_COOKIE_NAME)?.value;
  const isAuthorized = await verifyDemoToken(secret, token);

  if (!isAuthorized) {
    const loginUrl = new URL('/demo-login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
