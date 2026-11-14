-- The Ascendant — core schema (Phase 2)
--
-- Principles (DATABASE_SCHEMA.md, approved 2026-11-14):
--   * Content (races, campaign templates, competencies …) is separate from player state.
--   * Players may READ only their own rows (Row Level Security on every player table).
--   * Players may WRITE only plain choices (character name, campaign status). Everything the engine
--     owns — XP, levels, attributes, mastery, achievements, items — is read-only to players and is
--     written only by trusted server code (security-definer functions / service role).
--   * The XP ledger is append-only and refuses duplicate awards (unique idempotency key).
--
-- Supabase grants broad default privileges on public tables to the API roles, so every table
-- below revokes them first and then grants exactly what players need.

-- ─────────────────────────────────────────────────────────────── Content (read-only)

create table public.races (
  id text primary key,
  name text not null
);

create table public.classes (
  id text primary key,
  name text not null
);

create table public.backgrounds (
  id text primary key,
  name text not null
);

create table public.tinctures (
  id text primary key,
  name text not null
);

create table public.items (
  id text primary key,
  name text not null,
  description text not null default '',
  kind text not null default 'gear' check (kind in ('gear')),
  -- Equipment has no gameplay effect until boss combat is designed (Phase 5).
  cosmetic boolean not null default true
);

create table public.background_starting_items (
  background_id text not null references public.backgrounds on delete cascade,
  item_id text not null references public.items,
  primary key (background_id, item_id)
);

create table public.achievements (
  id text primary key,
  name text not null,
  description text not null
);

create table public.campaign_templates (
  id text primary key,
  subject text not null,
  title text not null,
  module text not null,
  version integer not null default 0 check (version >= 0),
  -- null = authored content available to everyone; otherwise a player's generated campaign (Phase 3).
  owner_user_id uuid references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.campaign_sub_skills (
  template_id text not null references public.campaign_templates on delete cascade,
  attribute text not null check (attribute in ('str', 'dex', 'con', 'int', 'wis', 'cha')),
  name text not null,
  primary key (template_id, attribute)
);

create table public.competency_definitions (
  id text primary key, -- '<template_id>/<key>'
  template_id text not null,
  key text not null,
  name text not null,
  description text not null default '',
  attribute text not null,
  prerequisite_ids text[] not null default '{}',
  unique (template_id, key),
  -- Every competency belongs to one of its campaign's six sub-skills.
  foreign key (template_id, attribute) references public.campaign_sub_skills (template_id, attribute) on delete cascade
);

-- ─────────────────────────────────────────────────────────────── Player data

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 2 and 40 and name = btrim(name) and name !~ '\s{2,}'),
  race_id text not null references public.races,
  class_id text not null references public.classes,
  background_id text not null references public.backgrounds,
  tincture_id text not null references public.tinctures,
  appearance_description text not null default '' check (char_length(appearance_description) <= 500),
  ideals text not null default '' check (char_length(ideals) <= 500),
  bonds text not null default '' check (char_length(bonds) <= 500),
  motivation text not null default '' check (char_length(motivation) <= 500),
  -- Engine-derived caches. Every score starts at 1 (GAME_DESIGN.md §3). Never player-writable.
  strength smallint not null default 1 check (strength between 1 and 20),
  dexterity smallint not null default 1 check (dexterity between 1 and 20),
  constitution smallint not null default 1 check (constitution between 1 and 20),
  intelligence smallint not null default 1 check (intelligence between 1 and 20),
  wisdom smallint not null default 1 check (wisdom between 1 and 20),
  charisma smallint not null default 1 check (charisma between 1 and 20),
  total_xp integer not null default 0 check (total_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template_id text not null references public.campaign_templates,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  campaign_xp integer not null default 0 check (campaign_xp >= 0),
  curriculum_version integer not null default 0 check (curriculum_version >= 0),
  started_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  unique (user_id, template_id)
);
create index campaigns_user_idx on public.campaigns (user_id);

create table public.competency_progress (
  campaign_id uuid not null references public.campaigns on delete cascade,
  competency_id text not null references public.competency_definitions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  mastery_stage smallint not null default 1 check (mastery_stage between 1 and 6),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  retention_strength real check (retention_strength between 0 and 1),
  last_demonstrated_at timestamptz,
  next_review_at timestamptz,
  primary key (campaign_id, competency_id)
);
create index competency_progress_user_idx on public.competency_progress (user_id);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  character_id uuid not null references public.characters on delete cascade,
  campaign_id uuid references public.campaigns on delete cascade,
  amount integer not null check (amount > 0 and amount <= 10000),
  kind text not null check (kind in (
    'lesson_completed', 'concept_explained', 'applied_problem_solved', 'practical_project_completed',
    'retention_review_passed', 'quest_completed', 'boss_defeated'
  )),
  source_id text not null check (char_length(source_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  config_version text not null,
  created_at timestamptz not null default now(),
  -- The database itself refuses a second award for the same achievement.
  unique (user_id, idempotency_key)
);
create index xp_transactions_campaign_idx on public.xp_transactions (campaign_id);

create table public.player_achievements (
  user_id uuid not null references auth.users on delete cascade,
  achievement_id text not null references public.achievements,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.character_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  item_id text not null references public.items,
  source text not null check (source in ('starting_gear', 'reward')),
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  unique (character_id, item_id, source)
);
create index character_items_user_idx on public.character_items (user_id);

-- ─────────────────────────────────────────────────────────────── Triggers

-- Profile row for every new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Characters: keep updated_at current.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();

-- New character: starting gear and the "oath" achievement.
create function public.handle_new_character() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.character_items (character_id, user_id, item_id, source)
    select new.id, new.user_id, bsi.item_id, 'starting_gear'
    from public.background_starting_items bsi
    where bsi.background_id = new.background_id
    on conflict do nothing;
  insert into public.player_achievements (user_id, achievement_id)
    values (new.user_id, 'character-created') on conflict do nothing;
  return new;
end $$;

create trigger characters_after_insert after insert on public.characters
  for each row execute function public.handle_new_character();

-- Campaign rules for players: only templates they may see; curriculum version comes from the
-- template; completion is granted by the engine only; last_played_at is always the server clock.
-- SECURITY INVOKER on purpose: current_user must be the caller's role, and the template lookup
-- must go through the caller's Row Level Security (a private template is invisible, so refused).
create function public.guard_campaign() returns trigger
language plpgsql set search_path = '' as $$
declare
  is_player boolean := current_user in ('authenticated', 'anon');
  tmpl public.campaign_templates;
begin
  if tg_op = 'INSERT' then
    select * into tmpl from public.campaign_templates where id = new.template_id;
    if not found then
      raise exception 'campaign template not available' using errcode = '42501';
    end if;
    new.curriculum_version := tmpl.version;
    if is_player then
      new.status := 'active';
      new.started_at := now();
      new.last_played_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if is_player then
    if old.status = 'completed' then
      raise exception 'a completed campaign cannot change status' using errcode = '42501';
    end if;
    if new.status = 'completed' then
      raise exception 'campaign completion is granted by the game engine' using errcode = '42501';
    end if;
    new.last_played_at := now();
  end if;
  return new;
end $$;

create trigger campaigns_guard before insert or update on public.campaigns
  for each row execute function public.guard_campaign();

-- New campaign: a Novice progress record for each of its competencies, and the "first steps" achievement.
create function public.handle_new_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.competency_progress (campaign_id, competency_id, user_id)
    select new.id, cd.id, new.user_id
    from public.competency_definitions cd
    where cd.template_id = new.template_id
    on conflict do nothing;
  insert into public.player_achievements (user_id, achievement_id)
    values (new.user_id, 'first-campaign') on conflict do nothing;
  return new;
end $$;

create trigger campaigns_after_insert after insert on public.campaigns
  for each row execute function public.handle_new_campaign();

-- ─────────────────────────────────────────────────────────────── Trusted functions

-- Applies an XP award planned by the game engine (src/engine/progression/xpAward.ts).
-- Atomic and idempotent: the ledger row and both caches change together, exactly once per key.
-- Callable only by the service role (server-side Edge Functions, Phase 3+).
create function public.apply_xp_award(
  p_user_id uuid,
  p_campaign_id uuid,
  p_kind text,
  p_source_id text,
  p_amount integer,
  p_idempotency_key text,
  p_config_version text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_character_id uuid;
  v_inserted uuid;
begin
  select id into v_character_id from public.characters where user_id = p_user_id;
  if v_character_id is null then
    raise exception 'player has no character' using errcode = 'P0002';
  end if;
  if p_campaign_id is not null and not exists (
    select 1 from public.campaigns where id = p_campaign_id and user_id = p_user_id
  ) then
    raise exception 'campaign does not belong to player' using errcode = '42501';
  end if;

  insert into public.xp_transactions (user_id, character_id, campaign_id, amount, kind, source_id, idempotency_key, config_version)
    values (p_user_id, v_character_id, p_campaign_id, p_amount, p_kind, p_source_id, p_idempotency_key, p_config_version)
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_inserted;

  if v_inserted is null then
    return false; -- already awarded
  end if;

  update public.characters set total_xp = total_xp + p_amount where id = v_character_id;
  if p_campaign_id is not null then
    update public.campaigns set campaign_xp = campaign_xp + p_amount where id = p_campaign_id;
  end if;
  return true;
end $$;

-- Deletes the calling player's character and all progress (Settings → Delete). The account itself
-- is kept; full account deletion needs the Auth admin API and arrives with Edge Functions.
create function public.delete_my_progress() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.campaigns where user_id = v_user;          -- cascades progress + campaign XP rows
  delete from public.characters where user_id = v_user;         -- cascades remaining XP rows + items
  delete from public.player_achievements where user_id = v_user;
  update public.profiles set settings = '{}' where user_id = v_user;
end $$;

-- ─────────────────────────────────────────────────────────────── Privileges

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Content: readable by everyone (filtered by RLS where content can be private).
grant select on public.races, public.classes, public.backgrounds, public.tinctures, public.items,
  public.background_starting_items, public.achievements, public.campaign_templates,
  public.campaign_sub_skills, public.competency_definitions to anon, authenticated;

-- Player tables: read own rows; write only plain player choices.
grant select on public.profiles, public.characters, public.campaigns, public.competency_progress,
  public.xp_transactions, public.player_achievements, public.character_items to authenticated;
grant update (display_name, settings) on public.profiles to authenticated;
grant insert (name, race_id, class_id, background_id, tincture_id, appearance_description, ideals, bonds, motivation)
  on public.characters to authenticated;
grant update (name, tincture_id, appearance_description, ideals, bonds, motivation) on public.characters to authenticated;
grant insert (template_id) on public.campaigns to authenticated;
grant update (status, last_played_at) on public.campaigns to authenticated;

grant execute on function public.delete_my_progress() to authenticated;
grant execute on function public.apply_xp_award(uuid, uuid, text, text, integer, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────── Row Level Security

alter table public.races enable row level security;
alter table public.classes enable row level security;
alter table public.backgrounds enable row level security;
alter table public.tinctures enable row level security;
alter table public.items enable row level security;
alter table public.background_starting_items enable row level security;
alter table public.achievements enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.campaign_sub_skills enable row level security;
alter table public.competency_definitions enable row level security;

create policy "content is public" on public.races for select to anon, authenticated using (true);
create policy "content is public" on public.classes for select to anon, authenticated using (true);
create policy "content is public" on public.backgrounds for select to anon, authenticated using (true);
create policy "content is public" on public.tinctures for select to anon, authenticated using (true);
create policy "content is public" on public.items for select to anon, authenticated using (true);
create policy "content is public" on public.background_starting_items for select to anon, authenticated using (true);
create policy "content is public" on public.achievements for select to anon, authenticated using (true);

create policy "authored or own templates" on public.campaign_templates for select to anon, authenticated
  using (owner_user_id is null or owner_user_id = (select auth.uid()));
create policy "sub-skills of visible templates" on public.campaign_sub_skills for select to anon, authenticated
  using (exists (select 1 from public.campaign_templates t where t.id = template_id));
create policy "competencies of visible templates" on public.competency_definitions for select to anon, authenticated
  using (exists (select 1 from public.campaign_templates t where t.id = template_id));

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.campaigns enable row level security;
alter table public.competency_progress enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.player_achievements enable row level security;
alter table public.character_items enable row level security;

create policy "own profile" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own character" on public.characters for select to authenticated using (user_id = (select auth.uid()));
create policy "create own character" on public.characters for insert to authenticated with check (user_id = (select auth.uid()));
create policy "edit own character" on public.characters for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own campaigns" on public.campaigns for select to authenticated using (user_id = (select auth.uid()));
create policy "start own campaign" on public.campaigns for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own campaign" on public.campaigns for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own progress" on public.competency_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "own xp" on public.xp_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy "own achievements" on public.player_achievements for select to authenticated using (user_id = (select auth.uid()));
create policy "own items" on public.character_items for select to authenticated using (user_id = (select auth.uid()));
