'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type GateState = 'checking' | 'signing-in' | 'done';

/**
 * Silently signs in first-time visitors anonymously. Renders nothing visible
 * on success; conventions/security.md §2 requires Turnstile in managed mode
 * so demo users see no challenge. Skips the widget entirely when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev, CAPTCHA off).
 */
export function AuthGate() {
  const router = useRouter();
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [state, setState] = useState<GateState>('checking');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (data.user) {
        setState('done');
        return;
      }

      if (!siteKey) {
        const { error } = await supabase.auth.signInAnonymously();
        if (!cancelled) {
          setState('done');
          if (!error) router.refresh();
        }
        return;
      }

      setState('signing-in');
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleToken(token: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously({
      options: { captchaToken: token },
    });
    if (error) {
      turnstileRef.current?.reset();
      return;
    }
    setState('done');
    router.refresh();
  }

  if (state !== 'signing-in' || !siteKey) return null;

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={siteKey}
      options={{ size: 'invisible' }}
      onSuccess={(token: string) => void handleToken(token)}
      onError={() => turnstileRef.current?.reset()}
    />
  );
}
