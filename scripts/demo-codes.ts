// Issue, list and revoke per-reviewer demo access codes (D-24).
//   pnpm script scripts/demo-codes.ts create "<label>" [--days N] [--sessions N]
//   pnpm script scripts/demo-codes.ts list
//   pnpm script scripts/demo-codes.ts revoke <id>
//
// Against production this is a human-only step (D-11): run it with an env file
// holding the hosted NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the
// deployed DEMO_CODE_PEPPER, e.g.
//   pnpm exec tsx --conditions=react-server --env-file=.env.production.local \
//     scripts/demo-codes.ts list
// `create` prints the code exactly once; only its hash is stored.
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  generateDemoCode,
  hashDemoCode,
  summarizeDemoCodes,
  type DemoCodeRow,
  type DemoEntitlementRow,
} from '@/lib/demo-codes';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_CODE_LIFETIME_DAYS = 14;
const DEFAULT_MAX_SESSIONS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const { data, error } = await createAdminClient()
    .from('demo_codes')
    .insert({
      label: input.label,
      code_hash: await hashDemoCode(env.DEMO_CODE_PEPPER, code),
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
}

async function listCodes(): Promise<void> {
  const client = createAdminClient();
  const [codes, entitlements] = await Promise.all([
    client
      .from('demo_codes')
      .select('id, label, expires_at, revoked_at, max_sessions')
      .order('created_at'),
    client.from('demo_entitlements').select('code_id, expires_at'),
  ]);
  if (codes.error) throw new Error('Could not list codes', { cause: codes.error });
  if (entitlements.error) {
    throw new Error('Could not read sessions', { cause: entitlements.error });
  }

  const summaries = summarizeDemoCodes(
    codes.data satisfies DemoCodeRow[],
    entitlements.data satisfies DemoEntitlementRow[],
    new Date(),
  );
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
  const client = createAdminClient();

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
  process.exit(1);
});
