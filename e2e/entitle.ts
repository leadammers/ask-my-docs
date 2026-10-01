import type { BrowserContext } from '@playwright/test';
import { hashDemoCode } from '../lib/demo-codes';
import { DEMO_SESSION_DURATION_MS } from '../lib/demo-gate';

// The demo cookie only opens the Next routes. Demo data is gated by a
// `demo_entitlements` row, which app/demo-login/actions.ts writes through
// claim_demo_session once a valid access code is entered
// (20261001120000_demo_access_codes.sql).
//
// The specs below mint a fresh anonymous session per test so notebooks and
// rate limits never collide, and typing a code for each of them would spend the
// suite's whole 5-attempt login budget — so their row is granted directly with
// the service role, pointing at a shared test code. That code is not the one
// typed into the form: direct grants ignore the seat cap but still count
// toward it, so mixing them would starve the UI logins. The real code → row
// path is covered by e2e/auth.setup.ts and by the pgTAP suite.

const AUTH_COOKIE_PATTERN = /-auth-token(\.\d+)?$/;

/** Typed into the login form by auth.setup.ts and notebooks.spec.ts. Throwaway test database only. */
export const E2E_DEMO_CODE = 'AMD-TEST-TEST-TEST-TEST-TEST-TEST-TE';
/** Only ever referenced by directly granted entitlements, never typed. */
const E2E_BULK_CODE = 'AMD-BULK-BULK-BULK-BULK-BULK-BULK-BU';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEATS = 10;

function serviceConfig(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the E2E tests',
    );
  }
  return { url, serviceKey };
}

function serviceHeaders(serviceKey: string, prefer: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

/** Upserts a long-lived, unrevoked test code and returns its id. */
async function upsertCode(code: string, label: string): Promise<string> {
  const { url, serviceKey } = serviceConfig();
  const pepper = process.env.DEMO_CODE_PEPPER;
  if (!pepper) throw new Error('DEMO_CODE_PEPPER must be set to run the E2E tests');

  const response = await fetch(`${url}/rest/v1/demo_codes?on_conflict=code_hash`, {
    method: 'POST',
    headers: serviceHeaders(serviceKey, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify({
      label,
      code_hash: await hashDemoCode(pepper, code),
      expires_at: new Date(Date.now() + ONE_DAY_MS).toISOString(),
      revoked_at: null,
      max_sessions: MAX_SEATS,
    }),
  });
  if (!response.ok) throw new Error(`creating the ${label} demo code failed: ${response.status}`);
  const rows = (await response.json()) as { id: string }[];
  const row = rows[0];
  if (!row) throw new Error(`creating the ${label} demo code returned no row`);
  return row.id;
}

/**
 * Called once by the setup project: makes sure the typed test code exists and
 * has all its seats free, so reruns within 8 h never meet `seats_full`.
 */
export async function resetTypedDemoCode(): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  const codeId = await upsertCode(E2E_DEMO_CODE, 'e2e typed');
  const response = await fetch(`${url}/rest/v1/demo_entitlements?code_id=eq.${codeId}`, {
    method: 'DELETE',
    headers: serviceHeaders(serviceKey, 'return=minimal'),
  });
  if (!response.ok) throw new Error(`freeing the e2e code's seats failed: ${response.status}`);
}

let bulkCodeId: Promise<string> | undefined;

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
  const { url, serviceKey } = serviceConfig();
  bulkCodeId ??= upsertCode(E2E_BULK_CODE, 'e2e bulk');
  const codeId = await bulkCodeId;

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
      code_id: codeId,
      expires_at: new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`granting the demo entitlement failed with ${response.status}`);
  }
}
