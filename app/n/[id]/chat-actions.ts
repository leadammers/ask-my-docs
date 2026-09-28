'use server';

import { revalidatePath } from 'next/cache';
import type { ErrorCode } from '@/lib/errors';
import { notebookIdSchema } from '@/lib/notebooks';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

/**
 * Deletes the visitor's own chat history in a notebook. No ownership check
 * beyond "the notebook exists and RLS lets this user select it" is needed:
 * `messages_delete_owner` only ever lets a row's own author delete it, so
 * this can never remove another visitor's messages or the demo owner's
 * (conventions/security.md §3).
 */
export async function clearChat(notebookId: string): Promise<Result<null, ErrorCode>> {
  const parsedId = notebookIdSchema.safeParse(notebookId);
  if (!parsedId.success) return fail('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (!notebook) return fail('not_found');

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('notebook_id', notebook.id)
    .eq('user_id', user.id);
  if (error) return fail('unexpected');

  revalidatePath(`/n/${notebook.id}`);
  return ok(null);
}
