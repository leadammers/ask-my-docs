import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';

export function createClient() {
  // lib/env.ts imports "server-only" and cannot be used from client bundles;
  // these two NEXT_PUBLIC_* vars are validated there for the server build, so
  // a successful build already guarantees they're set.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
