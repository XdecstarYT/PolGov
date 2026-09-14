-- Statecraft — core schema.
--
-- The normalised tables below are the queryable model: career history, the
-- news feed, election records and the turn log are all real rows that can be
-- read and aggregated.
--
-- games.snapshot holds the serialised engine state and is AUTHORITATIVE for
-- turn resolution. The engine is a single pure state machine; round-tripping
-- it through a dozen tables on every turn would risk silent divergence
-- between what the player sees and what the server recomputes. The snapshot
-- removes that risk; the normalised rows are written alongside it.

-- ---------- identity ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------- a run ----------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  country_name text not null default 'Verdana',
  difficulty text not null default 'standard'
    check (difficulty in ('stable', 'standard', 'fractured')),
  turn_number int not null default 1 check (turn_number >= 1),
  term_number int not null default 1 check (term_number >= 1),
  phase text not null default 'briefing',
  political_capital numeric not null default 50,
  approval numeric not null default 50,
  treasury numeric not null default 0,
  debt numeric not null default 0,
  status text not null default 'active'
    check (status in ('active', 'defeated', 'collapsed', 'retired')),
  -- Serialised GameState. Authoritative for resolution.
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_owner_idx on public.games (owner_id, updated_at desc);

-- ---------- parties ----------
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  party_key text not null,
  name text not null,
  color text,
  is_player boolean not null default false,
  in_coalition boolean not null default false,
  ideology jsonb not null,
  seats int not null default 0,
  coalition_mood numeric,
  red_lines jsonb not null default '[]'::jsonb,
  unique (game_id, party_key)
);

create index if not exists parties_game_idx on public.parties (game_id);

-- ---------- sectors ----------
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  key text not null
    check (key in ('economy', 'health', 'education', 'infrastructure', 'environment')),
  health numeric not null default 60,
  funding numeric not null default 0,
  unique (game_id, key)
);

create index if not exists sectors_game_idx on public.sectors (game_id);

-- ---------- legislation ----------
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  bill_key text not null,
  title text not null,
  category text not null,
  magnitude text not null check (magnitude in ('minor', 'major')),
  ideology jsonb not null,
  effects jsonb not null,
  status text not null
    check (status in ('available', 'proposed', 'passed', 'failed')),
  pass_chance numeric,
  pc_spent numeric not null default 0,
  turn_proposed int,
  turn_resolved int,
  unique (game_id, bill_key)
);

create index if not exists bills_game_status_idx on public.bills (game_id, status);

-- ---------- events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn_number int not null,
  template_key text not null,
  category text not null,
  severity int not null,
  narrative text,
  choices jsonb not null,
  chosen_index int,
  consequences jsonb,
  resolved_at timestamptz
);

create index if not exists events_game_turn_idx on public.events (game_id, turn_number);

-- ---------- regions & elections ----------
create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  region_key text not null,
  name text not null,
  seats int not null,
  lean jsonb not null,
  campaign_investment numeric not null default 0,
  unique (game_id, region_key)
);

create index if not exists regions_game_idx on public.regions (game_id);

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  term_number int not null,
  turnout numeric,
  results jsonb not null,
  regional_breakdown jsonb,
  held_at timestamptz not null default now()
);

create index if not exists elections_game_idx on public.elections (game_id, term_number);

-- ---------- narrative feed ----------
create table if not exists public.news_feed (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn_number int not null,
  outlet text,
  headline text not null,
  body text,
  sentiment numeric,
  created_at timestamptz not null default now()
);

create index if not exists news_game_turn_idx on public.news_feed (game_id, turn_number desc);

-- ---------- audit trail (powers the End-of-Turn Report) ----------
create table if not exists public.turn_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn_number int not null,
  entries jsonb not null,
  unique (game_id, turn_number)
);

create index if not exists turn_log_game_idx on public.turn_log (game_id, turn_number desc);

-- ---------- AI rate limiting ----------
-- One row per ai-narrator call, used to enforce a per-user hourly cap so a
-- compromised session cannot burn the Groq quota.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);
