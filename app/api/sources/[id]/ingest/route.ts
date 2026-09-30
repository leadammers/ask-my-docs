import { after } from 'next/server';
import { env } from '@/lib/env';
import { AppError, toErrorResponse, userMessage, type ErrorCode } from '@/lib/errors';
import { extractPdfPages } from '@/lib/ingest/adapters/pdf';
import { runIngest, type Extractor } from '@/lib/ingest/pipeline';
import { assertAiAllowed } from '@/lib/rate-limit';
import {
  CLAIMABLE_STATUSES,
  isStuckProcessing,
  maxUploadBytes,
  sourceIdSchema,
  STUCK_PROCESSING_MS,
} from '@/lib/sources';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOwnedSource } from '@/lib/supabase/ownership';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
// Ingestion runs in after() within this invocation (no queue), so the whole
// pipeline shares this budget (docs/architecture.md §4.1).
export const maxDuration = 300;

const INGEST_WINDOW_SECONDS = 60 * 60;

/**
 * Held back from `maxDuration` so a run that stops retrying still has room to
 * store its `failed` status: past the deadline no further quota wait starts
 * (lib/ai/retry.ts), and the update that follows has to fit in what is left.
 * Generous on purpose — overrunning costs a source stuck in `processing` until
 * STUCK_PROCESSING_MS, stopping early costs only a retry the user can press.
 */
const INGEST_DEADLINE_RESERVE_MS = 60_000;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Starts ingesting an owned PDF source that is pending or failed. Returns 202
 * once the source is claimed; the UI polls `sources.status` / `progress`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const invocationStartedAt = Date.now();
  // Request setup and after() share this route's invocation budget.
  const deadlineMs = invocationStartedAt + maxDuration * 1000 - INGEST_DEADLINE_RESERVE_MS;
  const { id } = await params;
  const parsedId = sourceIdSchema.safeParse(id);
  if (!parsedId.success) return errorResponse('invalid_input');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('unauthorized');

  const source = await findOwnedSource(supabase, parsedId.data, user.id);
  if (!source || source.kind !== 'pdf' || !source.storagePath) return errorResponse('not_found');
  const storagePath = source.storagePath;
  const now = new Date();
  if (!isClaimable(source.status, new Date(source.updatedAt), now)) {
    return errorResponse('already_processing');
  }

  // Conditional update = atomic claim: of two parallel calls, only one gets the row.
  // Claimed before the rate limit, so a losing parallel call spends no quota. A
  // stuck 'processing' row (its own release update failed) is reclaimable too,
  // once past STUCK_PROCESSING_MS — see lib/sources.ts.
  const { data: claimed, error: claimError } = await supabase
    .from('sources')
    .update({ status: 'processing', progress: null, error: null })
    .eq('id', source.id)
    .or(
      `status.in.(${CLAIMABLE_STATUSES.join(',')}),and(status.eq.processing,updated_at.lt.${new Date(now.getTime() - STUCK_PROCESSING_MS).toISOString()})`,
    )
    .select('id')
    .maybeSingle();
  if (claimError) return errorResponse('unexpected');
  if (!claimed) return errorResponse('already_processing');

  try {
    await assertAiAllowed(user.id, 'ingest', env.RATE_LIMIT_INGEST_PER_HOUR, INGEST_WINDOW_SECONDS);
  } catch (error: unknown) {
    const response = toErrorResponse(error);
    // Release the claim with the reason on the row, so Retry is offered right away.
    await supabase
      .from('sources')
      .update({ status: 'failed', error: response.userMessage })
      .eq('id', source.id)
      .eq('status', 'processing');
    return Response.json(
      { error: { code: response.code, message: response.userMessage } },
      { status: response.status },
    );
  }

  // Ownership is proven and the row claimed through the user client. The pipeline
  // outlives the response, so it can't use the cookie-bound client: a token refresh
  // there never reaches the browser and rotates the session away. Everything below
  // is scoped to this source's id and path (security.md §3).
  const admin = createAdminClient();
  const context = { requestId: crypto.randomUUID(), userId: user.id };
  after(() =>
    runIngest(
      admin,
      { id: source.id, notebookId: source.notebookId, userId: user.id },
      pdfExtractor(admin, storagePath),
      context,
      deadlineMs,
    ),
  );

  return Response.json({ sourceId: source.id }, { status: 202 });
}

function pdfExtractor(supabase: AdminClient, storagePath: string): Extractor {
  return async () => {
    // The size in createSourceUpload was a client claim; this is the real one,
    // checked from metadata so an oversized object is never downloaded.
    const { data: info, error: infoError } = await supabase.storage
      .from('sources')
      .info(storagePath);
    if (infoError) throw new Error('Could not read the uploaded file', { cause: infoError });
    // info.size is undefined only if the provider can't report it; fail closed rather
    // than skip the check, since that case would otherwise let anything through.
    if ((info.size ?? Infinity) > maxUploadBytes(env.MAX_UPLOAD_MB)) {
      throw new AppError('file_too_large');
    }

    const { data: file, error } = await supabase.storage.from('sources').download(storagePath);
    if (error) throw new Error('Could not read the uploaded file', { cause: error });
    // Re-checked on the downloaded blob too, in case metadata ever disagrees with the body.
    if (file.size > maxUploadBytes(env.MAX_UPLOAD_MB)) throw new AppError('file_too_large');
    return extractPdfPages(new Uint8Array(await file.arrayBuffer()));
  };
}

function isClaimable(status: string, updatedAt: Date, now: Date): boolean {
  if ((CLAIMABLE_STATUSES as readonly string[]).includes(status)) return true;
  return status === 'processing' && isStuckProcessing(updatedAt, now);
}

function errorResponse(code: ErrorCode): Response {
  const { status } = toErrorResponse(new AppError(code));
  return Response.json({ error: { code, message: userMessage(code) } }, { status });
}
