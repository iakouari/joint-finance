-- Joint Finance Tracker: shared-ledger sync server.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- What the server stores: one row per transaction, category or setting, but
-- only as ENCRYPTED text. The phones lock each record with a key made from the
-- invite code before sending it, so the server (and Supabase) see only
-- scrambled data plus: a random ledger ID, random record IDs, timestamps of
-- changes, and whether a record was deleted.

create table if not exists public.records (
  ledger_id  text    not null,
  id         text    not null,
  updated_at bigint  not null,          -- when the record was last changed (ms since 1970, from the phone's clock)
  deleted    boolean not null default false,
  iv         text,                      -- random value used once by the encryption
  data       text,                      -- the encrypted record
  seq        bigint  not null,          -- server-side change counter, lets phones ask "what changed since #N?"
  primary key (ledger_id, id)
);
create sequence if not exists public.records_seq;
create index if not exists records_ledger_seq on public.records (ledger_id, seq);

-- Nobody may read or write the table directly through the public API.
-- Row Level Security with no policies = no access; the only way in is the two
-- functions below, and both require knowing a ledger ID.
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;

-- Fetch every change in one ledger after change number p_since.
create or replace function public.pl_pull(p_ledger text, p_since bigint)
returns table (id text, updated_at bigint, deleted boolean, iv text, data text, seq bigint)
language sql
security definer
set search_path = public
as $$
  select r.id, r.updated_at, r.deleted, r.iv, r.data, r.seq
  from public.records r
  where r.ledger_id = p_ledger and r.seq > p_since
  order by r.seq
  limit 2000;
$$;

-- Save changes. A row only replaces the stored one if it is newer
-- ("last write wins"), so an old phone can't undo a newer edit.
-- Returns the ledger's latest change number.
create or replace function public.pl_push(p_ledger text, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ledger !~ '^[a-z2-7]{26}$' then
    raise exception 'invalid ledger id';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'send between 0 and 500 rows';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where length(coalesce(r->>'data', '')) > 20000 or length(r->>'id') > 100 or r->>'id' is null
  ) then
    raise exception 'row too large';
  end if;
  -- Usage limits, so nobody can fill the free database with junk:
  -- 50,000 records per ledger (years of use for two people) and 300 MB in total.
  if (select count(*) from public.records where ledger_id = p_ledger) + jsonb_array_length(p_rows) > 50000 then
    raise exception 'this shared ledger is full';
  end if;
  if pg_total_relation_size('public.records') > 300 * 1024 * 1024 then
    raise exception 'the sync database is full';
  end if;

  insert into public.records as t (ledger_id, id, updated_at, deleted, iv, data, seq)
  select p_ledger, r->>'id', (r->>'updated_at')::bigint, coalesce((r->>'deleted')::boolean, false),
         r->>'iv', r->>'data', nextval('public.records_seq')
  from jsonb_array_elements(p_rows) r
  on conflict (ledger_id, id) do update
    set updated_at = excluded.updated_at, deleted = excluded.deleted,
        iv = excluded.iv, data = excluded.data, seq = excluded.seq
    where t.updated_at < excluded.updated_at;

  return (select coalesce(max(seq), 0) from public.records where ledger_id = p_ledger);
end;
$$;

revoke all on function public.pl_pull(text, bigint) from public;
revoke all on function public.pl_push(text, jsonb) from public;
grant execute on function public.pl_pull(text, bigint) to anon;
grant execute on function public.pl_push(text, jsonb) to anon;
