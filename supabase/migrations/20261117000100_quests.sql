-- Phase 5 Part A: quests.
--
-- Quests are built by the game engine from each course (src/engine/quests/quests.ts); only their
-- completions and their Game Master stories are stored. Players read their own rows and write none:
-- completions are recorded by the `learning` Edge Function after the engine has checked the
-- player's real records, and stories by the `ai` Edge Function after the reply has been checked.

create table public.quest_completions (
  campaign_id uuid not null references public.campaigns on delete cascade,
  quest_key text not null check (quest_key ~ '^[a-z0-9-]{1,150}$'),
  user_id uuid not null references auth.users on delete cascade,
  completed_at timestamptz not null default now(),
  -- What the engine saw when it completed the quest (titles and objective ids), for audit.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  primary key (campaign_id, quest_key)
);
create index quest_completions_user_idx on public.quest_completions (user_id);

create table public.quest_stories (
  campaign_id uuid not null references public.campaigns on delete cascade,
  quest_key text not null check (quest_key ~ '^[a-z0-9-]{1,150}$'),
  user_id uuid not null references auth.users on delete cascade,
  -- The checked Game Master scene: narration, dialogue, choices.
  story jsonb not null check (jsonb_typeof(story) = 'object'),
  origin text not null check (origin in ('ai', 'fixture')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, quest_key)
);

alter table public.quest_completions enable row level security;
alter table public.quest_stories enable row level security;
create policy quest_completions_own on public.quest_completions for select to authenticated using (user_id = (select auth.uid()));
create policy quest_stories_own on public.quest_stories for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.quest_completions, public.quest_stories from anon, authenticated;
grant select on public.quest_completions, public.quest_stories to authenticated;

-- Everything the engine needs to build a campaign's quests: the course structure in order (no
-- answer keys) and the player's records.
create function public.quest_context(p_user_id uuid, p_campaign_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'campaignTitle', ct.title,
    'competencies', coalesce((
      select jsonb_agg(jsonb_build_object('id', cd.id, 'name', cd.name) order by cd.id)
      from public.competency_definitions cd where cd.template_id = c.template_id), '[]'::jsonb),
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'key', o.key, 'title', o.title, 'topic', t.title,
        'activities', coalesce((
          select jsonb_agg(jsonb_build_object('id', la.id, 'kind', la.kind, 'title', la.title, 'targetStage', la.target_stage,
                                              'competencyIds', to_jsonb(la.competency_ids)) order by la.position)
          from public.learning_activities la where la.objective_id = o.id), '[]'::jsonb))
        order by d.position, t.position, o.position)
      from public.curriculum_nodes o
      join public.curriculum_nodes t on t.id = o.parent_id
      join public.curriculum_nodes d on d.id = t.parent_id
      where o.template_id = c.template_id and o.kind = 'objective'
        and exists (select 1 from public.learning_activities la where la.objective_id = o.id)), '[]'::jsonb),
    'records', jsonb_build_object(
      'completedLessonIds', coalesce((select jsonb_agg(ac.activity_id) from public.activity_completions ac where ac.campaign_id = c.id), '[]'::jsonb),
      'passedCheckIds', coalesce((select jsonb_agg(distinct a.activity_id) from public.assessment_attempts a
                                  where a.campaign_id = c.id and a.passed and a.counted), '[]'::jsonb),
      'resolvedWeaknesses', (select count(*) from public.weakness_records w where w.campaign_id = c.id and w.status = 'resolved'),
      'openWeaknesses', (select count(*) from public.weakness_records w where w.campaign_id = c.id and w.status = 'open'),
      'reviewsPassed', (select count(*) from public.xp_transactions x where x.campaign_id = c.id and x.kind = 'retention_review_passed'),
      'stages', coalesce((select jsonb_agg(jsonb_build_object('competencyId', cp.competency_id, 'stage', cp.mastery_stage))
                          from public.competency_progress cp where cp.campaign_id = c.id), '[]'::jsonb),
      'completedQuestKeys', coalesce((select jsonb_agg(q.quest_key) from public.quest_completions q where q.campaign_id = c.id), '[]'::jsonb)),
    'stories', coalesce((select jsonb_agg(jsonb_build_object('questKey', s.quest_key, 'story', s.story, 'origin', s.origin))
                         from public.quest_stories s where s.campaign_id = c.id), '[]'::jsonb))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Records quests the engine found complete, each with its one-time XP award.
-- p_quests: [{questKey, snapshot, xp: {kind, sourceId, amount, idempotencyKey, configVersion}}]
create function public.learning_record_quests(p_user_id uuid, p_campaign_id uuid, p_quests jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  q jsonb;
  v_paid text[] := '{}';
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id;
  if not found or v_campaign.status <> 'active' then raise exception 'campaign not active' using errcode = '42501'; end if;
  if jsonb_typeof(p_quests) <> 'array' or jsonb_array_length(p_quests) > 50 then raise exception 'invalid quests' using errcode = '22023'; end if;

  for q in select * from jsonb_array_elements(p_quests) loop
    if q -> 'xp' ->> 'kind' <> 'quest_completed' or q -> 'xp' ->> 'sourceId' <> p_campaign_id::text || '/' || (q ->> 'questKey') then
      raise exception 'XP not allowed for this quest' using errcode = '42501';
    end if;
    insert into public.quest_completions (campaign_id, quest_key, user_id, snapshot)
      values (p_campaign_id, q ->> 'questKey', p_user_id, q -> 'snapshot')
      on conflict do nothing;
    if found then
      if public.apply_xp_award(p_user_id, p_campaign_id, 'quest_completed', q -> 'xp' ->> 'sourceId', (q -> 'xp' ->> 'amount')::integer,
                               q -> 'xp' ->> 'idempotencyKey', q -> 'xp' ->> 'configVersion') then
        v_paid := v_paid || (q -> 'xp' ->> 'idempotencyKey');
      end if;
    end if;
  end loop;
  return jsonb_build_object('xpPaid', to_jsonb(v_paid));
end $$;

-- Saves a quest's checked story once. A second story for the same quest is ignored.
create function public.ai_save_quest_story(p_user_id uuid, p_campaign_id uuid, p_quest_key text, p_story jsonb, p_origin text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.campaigns where id = p_campaign_id and user_id = p_user_id) then
    raise exception 'campaign does not belong to player' using errcode = '42501';
  end if;
  insert into public.quest_stories (campaign_id, quest_key, user_id, story, origin)
    values (p_campaign_id, p_quest_key, p_user_id, p_story, p_origin)
    on conflict do nothing;
  return found;
end $$;

revoke execute on function public.quest_context(uuid, uuid), public.learning_record_quests(uuid, uuid, jsonb),
  public.ai_save_quest_story(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.quest_context(uuid, uuid), public.learning_record_quests(uuid, uuid, jsonb),
  public.ai_save_quest_story(uuid, uuid, text, jsonb, text) to service_role;
