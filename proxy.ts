import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { LAST_SEEN_COOKIE } from '@/lib/config';
import { DEMO_COOKIE_NAME, verifyDemoToken } from '@/lib/demo-gate';

// The cron route is protected by its CRON_SECRET bearer token instead of the
// demo cookie (Vercel Cron can't log in); see app/api/cron/retention.
const PUBLIC_PATHS = ['/demo-login', '/api/cron/retention'];

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Records the visit for the retention cleanup (T08b) at most once a day per
  // browser: the cookie skips the database call on every other request, and
  // the SQL function itself writes at most once a day. Never blocks the page.
  if (user && !request.cookies.has(LAST_SEEN_COOKIE)) {
    try {
      const { error } = await supabase.rpc('touch_last_seen');
      if (!error) {
        response.cookies.set(LAST_SEEN_COOKIE, '1', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 24 * 60 * 60,
          path: '/',
        });
      }
    } catch {
      // Retried on the next request; a missed touch only delays nothing.
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
