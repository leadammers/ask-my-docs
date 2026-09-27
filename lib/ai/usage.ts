export type AiUsage = {
  requestId: string;
  userId: string | null;
  operation: string;
  model: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  durationMs: number;
};

/** One structured log line per model call — sizes and counts only, never content. */
export function formatUsage(usage: AiUsage): string {
  return JSON.stringify({ level: 'info', event: 'ai_usage', ...usage });
}

export function logUsage(usage: AiUsage): void {
  console.log(formatUsage(usage));
}
