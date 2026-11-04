-- Trading Desk: Supabase schema (run in the Supabase SQL editor; safe to re-run).
-- Single-user desk. Every row belongs to the signed-in user; row-level security enforces it.

-- Small settings blobs (watchlist boards, playbooks, filters, scan list, account settings)
create table if not exists public.desk_state (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.desk_state drop constraint if exists desk_state_key_check;
alter table public.desk_state add constraint desk_state_key_check
  check (key in ('boards', 'playbooks', 'filters', 'scanList', 'scanPrefs', 'account', 'exitRules'));

-- (if you ran an earlier version: the kind check is updated below)
-- One row per journal trade, cash transfer, daily check-in and daily recap (merged per row, newest edit wins)
create table if not exists public.desk_items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('trade', 'transfer', 'checkin', 'recap')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

alter table public.desk_items drop constraint if exists desk_items_kind_check;
alter table public.desk_items add constraint desk_items_kind_check check (kind in ('trade', 'transfer', 'checkin', 'recap'));

alter table public.desk_state enable row level security;
alter table public.desk_items enable row level security;

drop policy if exists "own rows" on public.desk_state;
create policy "own rows" on public.desk_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.desk_items;
create policy "own rows" on public.desk_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- After your first magic-link sign-in, turn off new sign-ups:
-- Supabase dashboard -> Authentication -> Sign In / Providers -> "Allow new users to sign up" = off.
