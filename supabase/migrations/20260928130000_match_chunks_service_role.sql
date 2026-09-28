-- T06 follow-up (CodeRabbit, PR #10): scripts/search.ts calls match_chunks
-- with the service-role client, which had no EXECUTE grant on this function
-- (only `authenticated`) — every call failed with permission denied on the
-- hosted project. `service_role` has bypassrls, so it already reads
-- unrestricted from `chunks`, `sources`, `notebooks` and `app_settings`
-- elsewhere in that script; withholding EXECUTE only on this one function
-- added no isolation, since RLS on the underlying tables was already bypassed
-- for that role. The production path (app/api/chat/route.ts) keeps calling
-- match_chunks with the request's RLS-scoped client, so this changes nothing
-- for user-facing access control.
grant execute on function public.match_chunks(uuid, uuid[], vector, text, int)
  to service_role;
