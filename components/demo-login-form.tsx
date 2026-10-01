'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type DemoLoginFormProps = {
  action: (formData: FormData) => Promise<void>;
  error?: string;
};

/**
 * The code is only accepted once there is a session to key the demo
 * entitlement to (app/demo-login/actions.ts), and AuthGate signs the visitor
 * in alongside this form rather than before it — so the submit stays disabled
 * until that session exists. Without the wait, a quick submit lands on
 * ?error=no_session even though nothing is wrong.
 */
export function DemoLoginForm({ action, error }: DemoLoginFormProps) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function checkSession(): Promise<void> {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setHasSession(Boolean(data.session));
    }

    void checkSession();
    // Sign-in usually finishes after this form has mounted, so the initial
    // check alone is not enough.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Enter your access code</h1>
      {error === 'rate_limited' ? (
        <p className="text-destructive text-sm">
          Too many attempts. Please wait a few minutes and try again.
        </p>
      ) : error === 'no_session' ? (
        <p className="text-destructive text-sm">
          Your session wasn&apos;t ready yet. Please reload the page and enter the code again.
        </p>
      ) : error === 'seats' ? (
        <p className="text-destructive text-sm">
          This code is already in use on its maximum number of devices. Ask for a new one if you
          need more.
        </p>
      ) : error ? (
        <p className="text-destructive text-sm">That code is invalid or has expired.</p>
      ) : null}
      <label htmlFor="code" className="text-sm font-medium">
        Access code
      </label>
      <input
        id="code"
        type="text"
        name="code"
        autoFocus
        required
        maxLength={64}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
      />
      <button
        type="submit"
        disabled={!hasSession}
        className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        Enter
      </button>
      {hasSession ? null : (
        <p className="text-muted-foreground text-sm">Setting up your session…</p>
      )}
    </form>
  );
}
