import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE_NAME, verifyDemoToken } from '@/lib/demo-gate';

const PUBLIC_PATHS = ['/demo-login'];

// Runs outside the module graph lib/env.ts validates for, same as the other
// direct process.env reads a proxy needs — see conventions/security.md §2:
// this gate keeps the whole app off the public internet, checked before
// anything else runs — including before the Supabase session refresh below.
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

  // Refreshes the Supabase session cookie on every request. It never signs
  // anyone in and never authorizes anything — see conventions/security.md §2:
  // "Authorization never happens in middleware alone."
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
