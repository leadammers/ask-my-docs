'use server';

import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
import type { ErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import {
  canAddSource,
  createSourceUploadSchema,
  isPdfFileName,
  maxUploadBytes,
  sourceIdSchema,
  sourceStoragePath,
  sourceTitleFromFileName,
} from '@/lib/sources';
import { findOwnedNotebook, findOwnedSource } from '@/lib/supabase/ownership';
import { createClient } from '@/lib/supabase/server';

export type SourceUpload = { sourceId: string; path: string; token: string };

/**
 * Creates a pending PDF source and a signed upload URL for it. The browser
 * uploads straight to Storage (files never pass through a function body),
 * then calls POST /api/sources/[id]/ingest.
 */
export async function createSourceUpload(input: {
  notebookId: string;
  fileName: string;
  size: number;
}): Promise<Result<SourceUpload, ErrorCode>> {
  const parsed = createSourceUploadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const { notebookId, fileName, size } = parsed.data;
  // Name and size are client claims; the ingest route re-checks the bytes.
  if (!isPdfFileName(fileName)) return fail('invalid_pdf');
  if (size > maxUploadBytes(env.MAX_UPLOAD_MB)) return fail('file_too_large');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const notebook = await findOwnedNotebook(supabase, notebookId, user.id);
  if (!notebook) return fail('not_found');

  const { count, error: countError } = await supabase
    .from('sources')
    .select('id', { count: 'exact', head: true })
    .eq('notebook_id', notebookId);
  if (countError) return fail('unexpected');
  if (!canAddSource(count ?? 0, env.MAX_SOURCES_PER_NOTEBOOK)) {
    return fail('source_limit_reached');
  }

  const sourceId = crypto.randomUUID();
  const path = sourceStoragePath(user.id, sourceId);
  const { error: insertError } = await supabase.from('sources').insert({
    id: sourceId,
    notebook_id: notebookId,
    kind: 'pdf',
    title: sourceTitleFromFileName(fileName),
    storage_path: path,
  });
  if (insertError) return fail('unexpected');

  const { data: upload, error: uploadError } = await supabase.storage
    .from('sources')
    .createSignedUploadUrl(path);
  if (uploadError) {
    await supabase.from('sources').delete().eq('id', sourceId);
    return fail('unexpected');
  }

  revalidatePath(`/n/${notebookId}`);
  return ok({ sourceId, path: upload.path, token: upload.token });
}

export async function deleteSource(id: string): Promise<Result<null, ErrorCode>> {
  const parsedId = sourceIdSchema.safeParse(id);
  if (!parsedId.success) return fail('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthorized');

  const source = await findOwnedSource(supabase, parsedId.data, user.id);
  if (!source) return fail('not_found');

  // The file first: the row is what lets us find it again (security.md §5).
  if (source.storagePath) {
    const { error: storageError } = await supabase.storage
      .from('sources')
      .remove([source.storagePath]);
    if (storageError) return fail('unexpected');
  }

  const { error } = await supabase.from('sources').delete().eq('id', source.id);
  if (error) return fail('unexpected');

  revalidatePath(`/n/${source.notebookId}`);
  return ok(null);
}
