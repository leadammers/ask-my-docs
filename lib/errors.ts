import { z } from 'zod';

export type ErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'invalid_input'
  | 'rate_limited'
  | 'limit_reached'
  | 'daily_cap_reached'
  | 'quota_exceeded'
  | 'source_limit_reached'
  | 'file_too_large'
  | 'invalid_pdf'
  | 'scanned_pdf'
  | 'too_many_pages'
  | 'no_text'
  | 'already_processing'
  | 'unexpected';

const MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "You don't have access to this.",
  not_found: "We couldn't find that.",
  invalid_input: "That input isn't valid.",
  rate_limited: "You're doing that too often — try again in a moment.",
  limit_reached: "You've reached the notebook limit for this demo.",
  daily_cap_reached: 'The daily demo limit is reached — please try again tomorrow.',
  quota_exceeded: 'The free AI quota is exhausted right now — try again in a minute.',
  source_limit_reached: "You've reached the source limit for this notebook.",
  file_too_large: 'That file is too large for this demo.',
  invalid_pdf: "That file isn't a valid PDF.",
  scanned_pdf: 'This PDF has no extractable text (scanned?). OCR is not supported.',
  too_many_pages: 'That PDF has too many pages for this demo.',
  no_text: "We couldn't find any usable text in that source.",
  already_processing: 'This source is already being processed.',
  unexpected: 'Something went wrong. Please try again.',
};

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  not_found: 404,
  invalid_input: 400,
  rate_limited: 429,
  limit_reached: 409,
  daily_cap_reached: 429,
  quota_exceeded: 503,
  source_limit_reached: 409,
  file_too_large: 413,
  invalid_pdf: 422,
  scanned_pdf: 422,
  too_many_pages: 422,
  no_text: 422,
  already_processing: 409,
  unexpected: 500,
};

export function userMessage(code: ErrorCode): string {
  return MESSAGES[code];
}

/** An expected failure that maps to a known error code; anything else is `unexpected`. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'AppError';
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('rate_limited');
    this.name = 'RateLimitError';
  }
}

export class DailyCapReachedError extends AppError {
  constructor() {
    super('daily_cap_reached');
    this.name = 'DailyCapReachedError';
  }
}

export class QuotaExceededError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super('quota_exceeded', options);
    this.name = 'QuotaExceededError';
  }
}

export type ErrorResponse = { status: number; code: ErrorCode; userMessage: string };

/** Maps any thrown value to what a route may send to the client — never raw error details. */
export function toErrorResponse(error: unknown): ErrorResponse {
  const code: ErrorCode = error instanceof AppError ? error.code : 'unexpected';
  return { status: STATUS[code], code, userMessage: MESSAGES[code] };
}

/** The body a route sends on failure; `apiErrorMessage` reads it back on the client. */
export function errorResponse(code: ErrorCode): Response {
  const { status, userMessage: message } = toErrorResponse(new AppError(code));
  return Response.json({ error: { code, message } }, { status });
}

const apiErrorBodySchema = z.object({ error: z.object({ message: z.string().min(1) }) });

/**
 * Recovers the user-facing message from a failed API call on the client.
 *
 * The AI SDK's transport turns a non-OK response into an error whose `message`
 * is the response body **verbatim** (`message: responseBody` in
 * `createUIApiCallError`), so a toast would otherwise show the raw JSON of
 * `errorResponse` above. Anything that is not that shape — a network failure,
 * a proxy's HTML error page — yields `null`, and the caller falls back to
 * `userMessage('unexpected')`.
 */
export function apiErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  let body: unknown;
  try {
    body = JSON.parse(error.message);
  } catch {
    return null;
  }
  const parsed = apiErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.error.message : null;
}
