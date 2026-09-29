'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  DEMO_COOKIE_NAME,
  DEMO_SESSION_DURATION_MS,
  createDemoToken,
  verifyDemoPassword,
} from '@/lib/demo-gate';
import { isRateLimited, recordAttempt } from '@/lib/demo-login-rate-limit';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const passwordSchema = z.string().min(1).max(200);

export async function login(formData: FormData): Promise<void> {
  const headerList = await headers();
  const clientKey = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(clientKey)) {
    redirect('/demo-login?error=rate_limited');
  }
  recordAttempt(clientKey);

  const parsedPassword = passwordSchema.safeParse(formData.get('password'));
  if (!parsedPassword.success) {
    redirect('/demo-login?error=1');
  }

  const isValid = await verifyDemoPassword(
    env.DEMO_COOKIE_SECRET,
    parsedPassword.data,
    env.DEMO_PASSWORD,
  );
  if (!isValid) {
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

  const now = Date.now();
  const { error: entitlementError } = await createAdminClient()
    .from('demo_entitlements')
    .upsert({
      user_id: user.id,
      expires_at: new Date(now + DEMO_SESSION_DURATION_MS).toISOString(),
    });
  if (entitlementError) {
    redirect('/demo-login?error=1');
  }

  const token = await createDemoToken(env.DEMO_COOKIE_SECRET, now);
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
