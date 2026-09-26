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
