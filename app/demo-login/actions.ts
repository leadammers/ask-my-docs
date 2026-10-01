'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoCodeInputSchema, hashDemoCode } from '@/lib/demo-codes';
import { DEMO_COOKIE_NAME, DEMO_SESSION_DURATION_MS, createDemoToken } from '@/lib/demo-gate';
import { isRateLimited, recordAttempt } from '@/lib/demo-login-rate-limit';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData): Promise<void> {
  const headerList = await headers();
  const clientKey = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(clientKey)) {
    redirect('/demo-login?error=rate_limited');
  }
  recordAttempt(clientKey);

  const parsedCode = demoCodeInputSchema.safeParse(formData.get('code'));
  if (!parsedCode.success) {
    redirect('/demo-login?error=1');
  }

  // The cookie only gates the Next routes. PostgREST is a different origin and
  // never sees it, so the same entitlement has to exist in the database — see
  // 20260929114828_demo_entitlement.sql (conventions/security.md §3).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/demo-login?error=no_session');
  }

  // The code is only ever hashed and matched against a unique column; the user
  // id comes from the server-resolved session, never from the form (D-24).
  const codeHash = await hashDemoCode(env.DEMO_CODE_PEPPER, parsedCode.data);
  const { data: outcome, error: claimError } = await createAdminClient().rpc('claim_demo_session', {
    p_code_hash: codeHash,
    p_user_id: user.id,
    p_ttl_seconds: DEMO_SESSION_DURATION_MS / 1000,
  });
  if (claimError) {
    // An RPC failure is ours, not the visitor's: don't tell them the code is bad.
    console.error(JSON.stringify({ level: 'error', event: 'demo_claim_failed' }));
    redirect('/demo-login?error=unavailable');
  }
  if (outcome === 'seats_full') {
    redirect('/demo-login?error=seats');
  }
  if (outcome !== 'ok') {
    redirect('/demo-login?error=1');
  }

  const token = await createDemoToken(env.DEMO_COOKIE_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DEMO_SESSION_DURATION_MS / 1000,
    path: '/',
  });

  redirect('/');
}
