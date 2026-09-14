-- Row Level Security.
--
-- Every table ships with RLS enabled and explicit policies. Child tables are
-- reachable only through a game the caller owns; there is no path by which one
-- account can read or write another account's run.

alter table public.profiles   enable row level security;
alter table public.games      enable row level security;
alter table public.parties    enable row level security;
alter table public.sectors    enable row level security;
alter table public.bills      enable row level security;
alter table public.events     enable row level security;
alter table public.regions    enable row level security;
alter table public.elections  enable row level security;
alter table public.news_feed  enable row level security;
alter table public.turn_log   enable row level security;
alter table public.ai_usage   enable row level security;

-- Belt and braces: revoke the anon/authenticated blanket grants so the
-- policies below are the only route in.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- profiles: a user sees only their own ----------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- games: owner only ----------
drop policy if exists games_select_own on public.games;
create policy games_select_own on public.games
  for select using (owner_id = (select auth.uid()));

drop policy if exists games_insert_own on public.games;
create policy games_insert_own on public.games
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists games_update_own on public.games;
create policy games_update_own on public.games
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists games_delete_own on public.games;
create policy games_delete_own on public.games
  for delete using (owner_id = (select auth.uid()));

-- ---------- child tables: reachable only via an owned game ----------
-- Written as a single helper predicate applied per table, so there is exactly
-- one rule to audit rather than nine subtly different ones.
create or replace function public.owns_game(target_game uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = target_game and g.owner_id = (select auth.uid())
  );
$$;

do $$
declare
  child text;
begin
  foreach child in array array[
    'parties', 'sectors', 'bills', 'events',
    'regions', 'elections', 'news_feed', 'turn_log'
  ]
  loop
    execute format('drop policy if exists %I_rw_own on public.%I', child, child);
    execute format(
      'create policy %I_rw_own on public.%I for all
         using (public.owns_game(game_id))
         with check (public.owns_game(game_id))',
      child, child
    );
  end loop;
end;
$$;

-- ---------- ai_usage: a user sees and appends only their own ----------
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select using (user_id = (select auth.uid()));

drop policy if exists ai_usage_insert_own on public.ai_usage;
create policy ai_usage_insert_own on public.ai_usage
  for insert with check (user_id = (select auth.uid()));
