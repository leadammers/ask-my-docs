-- D-24: per-reviewer demo access codes replace the shared demo password.
--
-- demo_codes holds one row per reviewer (HMAC hash only — the plaintext is
-- printed once by scripts/demo-codes.ts). Every entitlement now records the
-- code that granted it, and is_demo_entitled() requires that code to be
-- unrevoked and unexpired, so revoking a code closes the database half of the
-- gate immediately (D-21), including direct PostgREST calls.

-- Entitlements issued by the password have no code: everyone re-enters one.
delete from demo_entitlements;

create table demo_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 100),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_sessions integer not null default 3 check (max_sessions between 1 and 10)
);

alter table demo_codes enable row level security;
-- No policies: server only (default deny), like demo_entitlements.

revoke all on demo_codes from anon, authenticated, service_role;
grant select, insert, update on demo_codes to service_role;

alter table demo_entitlements
  add column code_id uuid not null references demo_codes (id) on delete cascade;
create index demo_entitlements_code_id_idx on demo_entitlements (code_id);

-- claim_demo_session: the only door from "a code" to "an entitlement".
--
-- The row lock on the code serialises concurrent claims, so two visitors cannot
-- both take the last seat. Re-claiming on the same session uses no extra seat
-- (the caller's own entitlement is excluded from the count), and claiming a
-- different code moves the session: the upsert re-points the entitlement.
-- Returns a status rather than raising, so a bad code leaks nothing through
-- error text.
--
-- security invoker on purpose: service_role already holds exactly the grants it
-- needs (select/update on demo_codes, DML on demo_entitlements) and bypasses
-- RLS, so nothing here needs elevated rights. If a grant ever drifts, the call
-- fails closed instead of running as the owner. This is not the self-service
-- security-definer grant function that 20260929114828_demo_entitlement.sql rules
-- out; only service_role can execute it at all.
create function public.claim_demo_session(
  p_code_hash text,
  p_user_id uuid,
  p_ttl_seconds integer
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code public.demo_codes%rowtype;
  v_seats_in_use integer;
begin
  select * into v_code
  from public.demo_codes
  where code_hash = p_code_hash
  for update;

  if not found or v_code.revoked_at is not null or v_code.expires_at <= now() then
    return 'invalid';
  end if;

  select count(*) into v_seats_in_use
  from public.demo_entitlements
  where code_id = v_code.id
    and expires_at > now()
    and user_id <> p_user_id;

  if v_seats_in_use >= v_code.max_sessions then
    return 'seats_full';
  end if;

  insert into public.demo_entitlements (user_id, code_id, expires_at)
  values (p_user_id, v_code.id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id) do update
    set code_id = excluded.code_id,
        expires_at = excluded.expires_at;

  return 'ok';
end;
$$;

-- Supabase's default privileges grant execute on new functions to anon and
-- authenticated directly, so revoke from them by name as well as from public.
revoke execute on function public.claim_demo_session(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_demo_session(text, uuid, integer) to service_role;

-- is_demo_entitled: a live entitlement on a live code. Same shape as before
-- (stable, security definer, empty search_path); the nine policies calling it
-- are untouched.
create or replace function public.is_demo_entitled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_entitlements e
    join public.demo_codes c on c.id = e.code_id
    where e.user_id = (select auth.uid())
      and e.expires_at > now()
      and c.revoked_at is null
      and c.expires_at > now()
  );
$$;
