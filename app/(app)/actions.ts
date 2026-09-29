'use server';

import { revalidatePath } from 'next/cache';
import type { ErrorCode } from '@/lib/errors';
import { canCreateNotebook, notebookIdSchema, notebookTitleSchema } from '@/lib/notebooks';
import { fail, ok, type Result } from '@/lib/result';
import { findOwnedNotebook } from '@/lib/supabase/ownership';
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

  // `/` for the card, `/n/[id]` for the workspace's inline title editor, which
  // has no optimistic copy and needs the server's new title to show through.
  revalidatePath('/');
  revalidatePath(`/n/${parsedId.data}`);
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

  // Storage objects first: the row cascade doesn't reach Storage (security.md §5).
  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('storage_path')
    .eq('notebook_id', parsedId.data)
    .not('storage_path', 'is', null);
  if (sourcesError) return fail('unexpected');
  const paths: string[] = [];
  for (const source of sources) {
    if (source.storage_path) paths.push(source.storage_path);
  }
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('sources').remove(paths);
    if (storageError) return fail('unexpected');
  }

  const { error } = await supabase.from('notebooks').delete().eq('id', parsedId.data);
  if (error) return fail('unexpected');

  revalidatePath('/');
  return ok(null);
}
