'use server';

import { revalidatePath } from 'next/cache';
import type { ErrorCode } from '@/lib/errors';
import { canCreateNotebook, notebookIdSchema, notebookTitleSchema } from '@/lib/notebooks';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

export async function createNotebook(title: string): Promise<Result<{ id: string }, ErrorCode>> {
  const parsedTitle = notebookTitleSchema.safeParse(title);
  if (!parsedTitle.success) return fail('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const { count, error: countError } = await supabase
    .from('notebooks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (countError) return fail('unexpected');
  if (!canCreateNotebook(count ?? 0)) return fail('limit_reached');

  const { data, error } = await supabase
    .from('notebooks')
    .insert({ title: parsedTitle.data })
    .select('id')
    .single();
  // The database trigger is the real limit (a parallel create can pass the
  // count above); it raises check_violation (23514) — see notebook_limit migration.
  if (error?.code === '23514') return fail('limit_reached');
  if (error || !data) return fail('unexpected');

  revalidatePath('/');
  return ok({ id: data.id });
}

export async function renameNotebook(id: string, title: string): Promise<Result<null, ErrorCode>> {
  const parsedId = notebookIdSchema.safeParse(id);
  const parsedTitle = notebookTitleSchema.safeParse(title);
  if (!parsedId.success || !parsedTitle.success) return fail('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const notebook = await findOwnedNotebook(supabase, parsedId.data, user.id);
  if (!notebook) return fail('not_found');

  const { error } = await supabase
    .from('notebooks')
    .update({ title: parsedTitle.data })
    .eq('id', parsedId.data);
  if (error) return fail('unexpected');

  revalidatePath('/');
  return ok(null);
}

export async function deleteNotebook(id: string): Promise<Result<null, ErrorCode>> {
  const parsedId = notebookIdSchema.safeParse(id);
  if (!parsedId.success) return fail('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const notebook = await findOwnedNotebook(supabase, parsedId.data, user.id);
  if (!notebook) return fail('not_found');

  const { error } = await supabase.from('notebooks').delete().eq('id', parsedId.data);
  if (error) return fail('unexpected');

  revalidatePath('/');
  return ok(null);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Loaded through the user-scoped client, then checked explicitly: RLS lets
// any authenticated user *select* the demo notebook (read access is shared),
// so a user_id match here is what actually proves ownership before a write.
async function findOwnedNotebook(
  supabase: SupabaseServerClient,
  id: string,
  userId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('notebooks')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return { id: data.id };
}
