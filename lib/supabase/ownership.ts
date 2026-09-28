import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceStatus } from '@/lib/sources';
import type { Database } from '@/lib/supabase/types';

type UserClient = SupabaseClient<Database>;

// Rows are loaded through the user-scoped client, then checked explicitly:
// RLS lets any authenticated user *select* demo rows (read access is shared),
// so a user_id match here is what actually proves ownership before a write.

export async function findOwnedNotebook(
  supabase: UserClient,
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

export type OwnedSource = {
  id: string;
  notebookId: string;
  kind: string;
  status: SourceStatus;
  storagePath: string | null;
  updatedAt: string;
};

export async function findOwnedSource(
  supabase: UserClient,
  id: string,
  userId: string,
): Promise<OwnedSource | null> {
  const { data } = await supabase
    .from('sources')
    .select('id, user_id, notebook_id, kind, status, storage_path, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return {
    id: data.id,
    notebookId: data.notebook_id,
    kind: data.kind,
    status: data.status as SourceStatus,
    storagePath: data.storage_path,
    updatedAt: data.updated_at,
  };
}
