export type ErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "daily_cap_reached"
  | "unexpected";

const MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "You don't have access to this.",
  not_found: "We couldn't find that.",
  invalid_input: "That input isn't valid.",
  rate_limited: "You're doing that too often — try again in a moment.",
  daily_cap_reached:
    "Daily demo limit reached. Please try again after midnight UTC.",
  unexpected: "Something went wrong. Please try again.",
};

export function userMessage(code: ErrorCode): string {
  return MESSAGES[code];
}
