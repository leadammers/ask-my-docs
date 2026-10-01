// Issue, list and revoke per-reviewer demo access codes (D-24).
//   pnpm script scripts/demo-codes.ts create "<label>" [--days N] [--sessions N]
//   pnpm script scripts/demo-codes.ts list
//   pnpm script scripts/demo-codes.ts revoke <id>
//
// Against production this is a human-only step (D-11). The script reads only three
// variables (not lib/env.ts), because Vercel will not hand out sensitive values:
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the hosted project, and
// the SAME DEMO_CODE_PEPPER as Vercel (a different one issues codes that never
// validate). Put them in a throwaway file or the shell, never in the repo:
//   pnpm exec tsx --env-file=.env.production.local scripts/demo-codes.ts list
// `create` prints the code exactly once; only its hash is stored. Try every new
// code on the live site before sending it (see tasks/README.md, release step 5).
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  generateDemoCode,
  hashDemoCode,
  summarizeDemoCodes,
  type DemoCodeRow,
  type DemoEntitlementRow,
} from '@/lib/demo-codes';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const DEFAULT_CODE_LIFETIME_DAYS = 14;
const DEFAULT_MAX_SESSIONS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// PostgREST caps one response (1000 rows by default), so list reads in pages.
const PAGE_SIZE = 1000;

const cliEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEMO_CODE_PEPPER: z.string().min(32),
});

// Service-role client built from the three variables above; same options as
// lib/supabase/admin.ts, which needs the full server env and `server-only`.
function createAdminClient() {
  const env = cliEnvSchema.parse(process.env);
  return {
    pepper: env.DEMO_CODE_PEPPER,
    client: createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

const createInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  days: z.coerce.number().int().min(1).max(90),
  sessions: z.coerce.number().int().min(1).max(10),
});

async function createCode(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { days: { type: 'string' }, sessions: { type: 'string' } },
  });
  const input = createInputSchema.parse({
    label: positionals[0],
    days: values.days ?? DEFAULT_CODE_LIFETIME_DAYS,
    sessions: values.sessions ?? DEFAULT_MAX_SESSIONS,
  });

  const code = generateDemoCode();
  const { client, pepper } = createAdminClient();
  const { data, error } = await client
    .from('demo_codes')
    .insert({
      label: input.label,
      code_hash: await hashDemoCode(pepper, code),
      expires_at: new Date(Date.now() + input.days * MS_PER_DAY).toISOString(),
      max_sessions: input.sessions,
    })
    .select('id, expires_at')
    .single();
  if (error) throw new Error('Could not create the code', { cause: error });

  console.log(`Code for "${input.label}" (shown once, not stored): ${code}`);
  console.log(`id:          ${data.id}`);
  console.log(`expires:     ${data.expires_at}`);
  console.log(`max devices: ${input.sessions}`);
  console.log('Before sending it: enter this code on the live site once (release step 5).');
}

async function readAllPages<Row>(
  failureMessage: string,
  readPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(failureMessage, { cause: error });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function listCodes(): Promise<void> {
  const { client } = createAdminClient();
  const [codes, entitlements] = await Promise.all([
    readAllPages<DemoCodeRow>('Could not list codes', (from, to) =>
      client
        .from('demo_codes')
        .select('id, label, expires_at, revoked_at, max_sessions')
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    readAllPages<DemoEntitlementRow>('Could not read sessions', (from, to) =>
      client
        .from('demo_entitlements')
        .select('code_id, expires_at')
        .order('user_id')
        .range(from, to),
    ),
  ]);

  const summaries = summarizeDemoCodes(codes, entitlements, new Date());
  console.table(
    summaries.map((summary) => ({
      id: summary.id,
      label: summary.label,
      status: summary.status,
      expires: summary.expiresAt,
      seats: `${summary.seatsInUse}/${summary.maxSessions}`,
      lastUsed: summary.lastUsedAt ?? '—',
    })),
  );
}

async function revokeCode(args: string[]): Promise<void> {
  const id = z.string().uuid().parse(args[0]);
  const { client } = createAdminClient();

  const { data: existing, error: readError } = await client
    .from('demo_codes')
    .select('label, revoked_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw new Error('Could not read the code', { cause: readError });
  if (!existing) throw new Error(`No code with id ${id}`);
  if (existing.revoked_at) {
    console.log(`"${existing.label}" was already revoked at ${existing.revoked_at}`);
    return;
  }

  const { error } = await client
    .from('demo_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Could not revoke the code', { cause: error });
  console.log(`Revoked "${existing.label}". Its sessions lose data access on their next request.`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'create') return createCode(rest);
  if (command === 'list') return listCodes();
  if (command === 'revoke') return revokeCode(rest);
  throw new Error(
    'Usage: demo-codes.ts create "<label>" [--days N] [--sessions N] | list | revoke <id>',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  // The operator is the only reader and the cause (a PostgREST error) holds no secrets.
  if (error instanceof Error && error.cause) console.error('Cause:', error.cause);
  process.exit(1);
});
