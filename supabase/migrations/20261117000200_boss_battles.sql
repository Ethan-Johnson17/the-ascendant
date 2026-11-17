-- Phase 5 Part B1: boss battles.
--
-- One boss per stage gate (2 Apprentice, 3 Competent, 4 Proficient). The game engine decides when a
-- boss opens, what each answer does and who wins (src/engine/encounters/boss.ts); the `learning`
-- Edge Function records each decision here. The database re-checks what matters most: answers in
-- order, Resolve falls by at most 1 per answer, a win only with Resolve left after the last
-- question, the victory XP once per boss, and no player writes.

create table public.boss_encounters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  stage smallint not null check (stage in (2, 3, 4)),
  status text not null default 'active' check (status in ('active', 'won', 'lost')),
  -- The allowed plan: name, epithet, intro, rounds (competency, title, narration, question ids),
  -- victory and defeat text. Question ids only, never answers.
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  plan_origin text not null check (plan_origin in ('ai', 'fixture', 'game')),
  question_ids text[] not null check (cardinality(question_ids) between 1 and 12),
  max_resolve smallint not null check (max_resolve between 1 and 10),
  resolve smallint not null check (resolve >= 0),
  position integer not null default 0 check (position >= 0),
  -- One entry per answer: item, concept, correct, the answer given.
  answers jsonb not null default '[]' check (jsonb_typeof(answers) = 'array'),
  missed_concept_ids text[] not null default '{}',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (resolve <= max_resolve),
  check (position <= cardinality(question_ids)),
  check ((status = 'active') = (ended_at is null)),
  check (status <> 'won' or (resolve > 0 and position = cardinality(question_ids))),
  check (status <> 'lost' or resolve = 0)
);
create index boss_encounters_campaign_idx on public.boss_encounters (campaign_id, stage);
-- One battle at a time per boss, and each boss is beaten once.
create unique index boss_encounters_one_active on public.boss_encounters (campaign_id, stage) where status = 'active';
create unique index boss_encounters_one_win on public.boss_encounters (campaign_id, stage) where status = 'won';

alter table public.boss_encounters enable row level security;
create policy boss_encounters_own on public.boss_encounters for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.boss_encounters from anon, authenticated;
grant select on public.boss_encounters to authenticated;

-- Everything the engine needs to decide a campaign's bosses (no answer keys).
create function public.boss_context(p_user_id uuid, p_campaign_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'campaignTitle', ct.title,
    'campaignDescription', coalesce(gs.description, ct.module),
    'unbuiltLessons', coalesce((select count(*) from jsonb_array_elements(gs.outline -> 'lessons') x where not (x ->> 'built')::boolean), 0),
    'competencies', coalesce((
      select jsonb_agg(jsonb_build_object('id', cd.id, 'name', cd.name) order by cd.id)
      from public.competency_definitions cd where cd.template_id = c.template_id), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object('id', la.id, 'title', la.title, 'targetStage', la.target_stage, 'competencyIds', to_jsonb(la.competency_ids)) order by la.position)
      from public.learning_activities la where la.template_id = c.template_id and la.kind = 'assessment'), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'activityId', la.id, 'activityStage', la.target_stage, 'conceptId', ce.id, 'concept', ce.title,
        'competencyIds', to_jsonb(ce.competency_ids), 'difficulty', i.difficulty, 'kind', i.kind, 'prompt', i.definition ->> 'prompt')
        order by la.position, i.position)
      from public.assessment_items i
      join public.learning_activities la on la.id = i.activity_id
      join public.codex_entries ce on ce.id = i.concept_id
      where la.template_id = c.template_id and i.kind <> 'written'), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('competencyId', cp.competency_id, 'stage', cp.mastery_stage))
                        from public.competency_progress cp where cp.campaign_id = c.id), '[]'::jsonb),
    'encounters', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'stage', e.stage, 'status', e.status, 'startedAt', e.started_at,
                                                                'endedAt', e.ended_at, 'missedConceptIds', to_jsonb(e.missed_concept_ids)) order by e.started_at)
                            from public.boss_encounters e where e.campaign_id = c.id), '[]'::jsonb),
    'checkPasses', coalesce((select jsonb_agg(jsonb_build_object('activityId', a.activity_id, 'at', a.submitted_at))
                             from public.assessment_attempts a where a.campaign_id = c.id and a.passed and a.counted), '[]'::jsonb))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  left join public.generated_subjects gs on gs.template_id = c.template_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Starts a battle the engine has allowed. The plan's questions must be this course's own.
create function public.boss_create_encounter(p_user_id uuid, p_campaign_id uuid, p_stage smallint, p_plan jsonb, p_origin text,
                                             p_question_ids text[], p_max_resolve smallint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  v_id uuid;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id;
  if not found or v_campaign.status <> 'active' then raise exception 'campaign not active' using errcode = '42501'; end if;
  if (select count(distinct x) from unnest(p_question_ids) x) <> cardinality(p_question_ids) then
    raise exception 'a question appears twice' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_question_ids) x where not exists (
      select 1 from public.assessment_items i join public.learning_activities la on la.id = i.activity_id
      where i.id = x and la.template_id = v_campaign.template_id and i.kind <> 'written')) then
    raise exception 'question not in this course' using errcode = '42501';
  end if;
  if p_stage > 2 and not exists (select 1 from public.boss_encounters where campaign_id = p_campaign_id and stage = p_stage - 1 and status = 'won') then
    raise exception 'previous boss not beaten' using errcode = '42501';
  end if;
  insert into public.boss_encounters (user_id, campaign_id, stage, plan, plan_origin, question_ids, max_resolve, resolve)
    values (p_user_id, p_campaign_id, p_stage, p_plan, p_origin, p_question_ids, p_max_resolve, p_max_resolve)
    returning id into v_id;
  return v_id;
end $$;

-- The current question of a battle, with its answer key (server only), and the Weakness Bank
-- record for its concept.
create function public.boss_answer_context(p_user_id uuid, p_encounter_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'encounter', jsonb_build_object('id', e.id, 'campaignId', e.campaign_id, 'stage', e.stage, 'status', e.status, 'resolve', e.resolve,
                                    'maxResolve', e.max_resolve, 'position', e.position, 'questionIds', to_jsonb(e.question_ids),
                                    'plan', e.plan, 'planOrigin', e.plan_origin, 'answers', e.answers, 'endedAt', e.ended_at),
    'item', (select jsonb_build_object('id', i.id, 'conceptId', i.concept_id, 'definition', i.definition)
             from public.assessment_items i where i.id = e.question_ids[e.position + 1]),
    'weakness', (select to_jsonb(w) from public.weakness_records w
                 where w.campaign_id = e.campaign_id and w.concept_id = (select i.concept_id from public.assessment_items i where i.id = e.question_ids[e.position + 1])))
  from public.boss_encounters e
  join public.campaigns c on c.id = e.campaign_id
  where e.id = p_encounter_id and e.user_id = p_user_id
$$;

-- Records one answer exactly as the engine decided it.
-- p_outcome: {itemId, conceptId, correct, given, resolve, status, endedAt, weakness?, xp?}
create function public.boss_record_answer(p_user_id uuid, p_encounter_id uuid, p_position integer, p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.boss_encounters;
  w jsonb := p_outcome -> 'weakness';
  v_resolve smallint := (p_outcome ->> 'resolve')::smallint;
  v_status text := p_outcome ->> 'status';
  v_correct boolean := (p_outcome ->> 'correct')::boolean;
  v_paid boolean := false;
begin
  select * into e from public.boss_encounters where id = p_encounter_id and user_id = p_user_id for update;
  if not found then raise exception 'battle not found' using errcode = 'P0002'; end if;
  if e.status <> 'active' then raise exception 'battle is over' using errcode = '42501'; end if;
  if e.position <> p_position or e.question_ids[e.position + 1] <> p_outcome ->> 'itemId' then
    raise exception 'answer out of order' using errcode = '40001';
  end if;
  if v_resolve <> e.resolve - (case when v_correct then 0 else 1 end) then raise exception 'Resolve not allowed' using errcode = '42501'; end if;
  if v_status <> (case when v_resolve <= 0 then 'lost' when e.position + 1 >= cardinality(e.question_ids) then 'won' else 'active' end) then
    raise exception 'battle result not allowed' using errcode = '42501';
  end if;

  update public.boss_encounters set
    position = e.position + 1,
    resolve = v_resolve,
    status = v_status,
    ended_at = case when v_status = 'active' then null else now() end,
    answers = e.answers || jsonb_build_array(jsonb_build_object('itemId', p_outcome ->> 'itemId', 'conceptId', p_outcome ->> 'conceptId',
                                                                'correct', v_correct, 'given', p_outcome -> 'given')),
    missed_concept_ids = case when v_correct then e.missed_concept_ids else e.missed_concept_ids || (p_outcome ->> 'conceptId') end
  where id = e.id;

  if w is not null and jsonb_typeof(w) = 'object' then
    if w ->> 'conceptId' <> p_outcome ->> 'conceptId' then raise exception 'weakness for another concept' using errcode = '42501'; end if;
    insert into public.weakness_records as wr (campaign_id, concept_id, user_id, status, error_category, occurrence_count,
        correct_reviews, next_review_at, last_mistake_at, last_successful_review, resolved_at, incorrect_responses)
      values (e.campaign_id, w ->> 'conceptId', p_user_id, w ->> 'status', w ->> 'errorCategory', (w ->> 'occurrenceCount')::integer,
        (w ->> 'correctReviews')::integer, (w ->> 'nextReviewAt')::timestamptz, (w ->> 'lastMistakeAt')::timestamptz,
        (w ->> 'lastSuccessfulReview')::timestamptz, (w ->> 'resolvedAt')::timestamptz, w -> 'incorrectResponses')
      on conflict (campaign_id, concept_id) do update set
        status = excluded.status, error_category = excluded.error_category, occurrence_count = excluded.occurrence_count,
        correct_reviews = excluded.correct_reviews, next_review_at = excluded.next_review_at, last_mistake_at = excluded.last_mistake_at,
        last_successful_review = excluded.last_successful_review, resolved_at = excluded.resolved_at,
        incorrect_responses = excluded.incorrect_responses, updated_at = now();
  end if;

  insert into public.concept_progress (campaign_id, concept_id, user_id, last_reviewed_at, times_correct, times_incorrect)
    values (e.campaign_id, p_outcome ->> 'conceptId', p_user_id, now(), case when v_correct then 1 else 0 end, case when v_correct then 0 else 1 end)
    on conflict (campaign_id, concept_id) do update set
      last_reviewed_at = now(),
      times_correct = public.concept_progress.times_correct + excluded.times_correct,
      times_incorrect = public.concept_progress.times_incorrect + excluded.times_incorrect;

  if v_status = 'won' then
    if p_outcome -> 'xp' ->> 'kind' <> 'boss_defeated' or p_outcome -> 'xp' ->> 'sourceId' <> e.campaign_id::text || '/stage-' || e.stage then
      raise exception 'XP not allowed for this boss' using errcode = '42501';
    end if;
    v_paid := public.apply_xp_award(p_user_id, e.campaign_id, 'boss_defeated', p_outcome -> 'xp' ->> 'sourceId', (p_outcome -> 'xp' ->> 'amount')::integer,
                                    p_outcome -> 'xp' ->> 'idempotencyKey', p_outcome -> 'xp' ->> 'configVersion');
  elsif p_outcome -> 'xp' is not null and jsonb_typeof(p_outcome -> 'xp') <> 'null' then
    raise exception 'XP only for a victory' using errcode = '42501';
  end if;
  update public.campaigns set last_played_at = now() where id = e.campaign_id;
  return jsonb_build_object('xpPaid', v_paid);
end $$;

-- The stage gate, enforced by the database too: a check for stage 3 or above can be started only
-- after the boss of the stage below is beaten. Earned stages are never taken away: a check the
-- player already passed (before bosses existed, say) can always be taken again for review.
create function public.guard_boss_gate() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_target smallint;
begin
  select target_stage into v_target from public.learning_activities where id = new.activity_id;
  if v_target is not null and v_target >= 3 and not exists (
      select 1 from public.boss_encounters where campaign_id = new.campaign_id and stage = v_target - 1 and status = 'won')
    and not exists (select 1 from public.assessment_attempts a
                    where a.campaign_id = new.campaign_id and a.activity_id = new.activity_id and a.passed and a.counted) then
    raise exception 'beat the boss of the stage below first' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger assessment_attempts_boss_gate before insert on public.assessment_attempts
  for each row execute function public.guard_boss_gate();
revoke execute on function public.guard_boss_gate() from public, anon, authenticated;

-- For the check gate: which bosses a player has beaten in a campaign, and whether they have
-- already passed this check.
create function public.boss_check_gate(p_user_id uuid, p_campaign_id uuid, p_activity_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'wonStages', coalesce((select jsonb_agg(distinct stage) from public.boss_encounters
                           where user_id = p_user_id and campaign_id = p_campaign_id and status = 'won'), '[]'::jsonb),
    'passedBefore', exists (select 1 from public.assessment_attempts
                            where user_id = p_user_id and campaign_id = p_campaign_id and activity_id = p_activity_id and passed and counted))
$$;

revoke execute on function public.boss_context(uuid, uuid), public.boss_create_encounter(uuid, uuid, smallint, jsonb, text, text[], smallint),
  public.boss_answer_context(uuid, uuid), public.boss_record_answer(uuid, uuid, integer, jsonb), public.boss_check_gate(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.boss_context(uuid, uuid), public.boss_create_encounter(uuid, uuid, smallint, jsonb, text, text[], smallint),
  public.boss_answer_context(uuid, uuid), public.boss_record_answer(uuid, uuid, integer, jsonb), public.boss_check_gate(uuid, uuid, text)
  to service_role;
