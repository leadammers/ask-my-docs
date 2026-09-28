-- T07: lets a visitor clear their own chat history. No demo-specific
-- carve-out is needed — a message's user_id is always the visitor's own,
-- even on the demo notebook (security.md §3's "own rows only" case), so
-- deleting it never touches another visitor's messages or the demo content
-- itself.

create policy messages_delete_owner
  on messages for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on messages to authenticated;
