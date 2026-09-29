-- PR #13 review (CodeRabbit): `authenticated` held insert, update and delete on
-- `chunks` — none of which the app ever performs with a user-scoped client. The
-- ingest pipeline writes and clears chunks exclusively through the service-role
-- client (app/api/sources/[id]/ingest/route.ts), so those grants only opened a
-- path to POST rows straight to PostgREST: unbounded `content`, any number of
-- rows, outside the ingest rate limit and outside the per-notebook source limit.
-- Reads stay: the citation drawer queries `chunks` with the browser client
-- (components/workspace/citation-drawer.tsx), scoped by RLS.
--
-- `messages` is the opposite case — the chat route persists the visitor's
-- question with the user-scoped client (app/api/chat/route.ts), so the insert
-- grant has to stay. `content` is unbounded `text` and the route's
-- CHAT_QUESTION_MAX_CHARS only guards the route's own path, so the column takes
-- the ceiling instead: 5x the question cap, and well above what 1024 output
-- tokens (CHAT_MAX_OUTPUT_TOKENS) can produce for an answer. Keep both numbers
-- in step with lib/config.ts.
revoke insert, update, delete on chunks from authenticated;

-- The three write policies go with the grants. With no insert/update/delete
-- privilege they can never fire, and a policy that cannot fire is a claim the
-- table does not make (the two select policies are the whole truth: clients
-- read, the server writes). Dropping them is also the safer half of the pair — were the
-- grants ever restored by accident, RLS's deny-by-default would still hold
-- instead of silently reopening the hole.
drop policy chunks_insert_owner on chunks;
drop policy chunks_update_owner on chunks;
drop policy chunks_delete_owner on chunks;

alter table messages
  add constraint messages_content_length check (char_length(content) <= 20000);
