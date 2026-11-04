-- Trading Desk: Supabase schema (run once in the Supabase SQL editor).
-- Single-user desk. Every row belongs to the signed-in user; row-level security enforces it.

create table if not exists public.desk_state (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null check (key in ('boards', 'playbooks', 'filters', 'scanList', 'scanPrefs')),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.desk_state enable row level security;

drop policy if exists "own rows" on public.desk_state;
create policy "own rows" on public.desk_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- After your first magic-link sign-in, turn off new sign-ups:
-- Supabase dashboard -> Authentication -> Sign In / Providers -> "Allow new users to sign up" = off.
