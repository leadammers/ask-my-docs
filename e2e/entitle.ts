import type { BrowserContext } from '@playwright/test';
import { DEMO_SESSION_DURATION_MS } from '../lib/demo-gate';

// The demo cookie only opens the Next routes. Demo data is gated by a
// `demo_entitlements` row, which app/demo-login/actions.ts writes once the
// password is accepted (20260929114828_demo_entitlement.sql).
//
// The specs below mint a fresh anonymous session per test so notebooks and
// rate limits never collide, and re-entering the password for each of them
// would spend the suite's whole 5-attempt login budget — so their row is
// granted directly with the service role instead. The real password → row
// path is covered by e2e/auth.setup.ts and by the pgTAP suite.

const AUTH_COOKIE_PATTERN = /-auth-token(\.\d+)?$/;

/** The user id the browser is signed in as, read from its own session cookie. */
function sessionUserId(cookieValues: string[]): string {
  const decoded = Buffer.from(cookieValues.join('').replace(/^base64-/, ''), 'base64url').toString(
    'utf8',
  );
  const session = JSON.parse(decoded) as { user?: { id?: string } };
  const userId = session.user?.id;
  if (!userId) throw new Error('the session cookie holds no user id');
  return userId;
}

export async function entitleSession(context: BrowserContext): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the E2E tests',
    );
  }

  const cookies = await context.cookies();
  if (!cookies.some((cookie) => cookie.name === 'demo_session')) {
    throw new Error('entitleSession needs a demo_session cookie — pass the demo gate first');
  }
  const authCookies = cookies
    .filter((cookie) => AUTH_COOKIE_PATTERN.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (authCookies.length === 0) {
    throw new Error('the session was never signed in — no auth cookie to read a user id from');
  }

  const response = await fetch(`${url}/rest/v1/demo_entitlements`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: sessionUserId(authCookies.map((cookie) => cookie.value)),
      expires_at: new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`granting the demo entitlement failed with ${response.status}`);
  }
}
