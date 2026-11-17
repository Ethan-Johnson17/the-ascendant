-- Phase 5 Part B2: race traits and class abilities in boss battles.
--
-- Each player has one race trait and one class ability, each usable once per boss
-- (src/engine/encounters/powers.ts). The engine decides every effect; these functions record it
-- and re-check what matters: the power is the player's own and unused, Resolve changes only as the
-- power allows, the Dwarf's extra Resolve, and question lists change only as the power allows.

alter table public.boss_encounters
  add column powers_used text[] not null default '{}',
  -- What used powers revealed, so a resumed battle shows them again: hints by item id, the scouted
  -- round, the recalled concept.
  add column effects jsonb not null default '{}' check (jsonb_typeof(effects) = 'object');

-- Lucky can add one question to a full battle.
alter table public.boss_encounters drop constraint boss_encounters_question_ids_check;
alter table public.boss_encounters add constraint boss_encounters_question_ids_check check (cardinality(question_ids) between 1 and 13);

-- The player's race trait and class ability (mirrors racePowers / classPowers in powers.ts).
create function public.boss_powers_of(p_user_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case ch.race_id when 'human' then 'adaptable' when 'elf' then 'keen_insight' when 'dwarf' then 'stalwart' when 'halfling' then 'lucky' end,
    case ch.class_id when 'fighter' then 'second_wind' when 'ranger' then 'scout_ahead' when 'rogue' then 'gambit' when 'wizard' then 'arcane_recall' when 'cleric' then 'sanctuary' end
  ], null)
  from public.characters ch where ch.user_id = p_user_id
$$;

-- Everything the engine needs to decide a campaign's bosses (no answer keys), now with the
-- player's powers.
create or replace function public.boss_context(p_user_id uuid, p_campaign_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'campaignTitle', ct.title,
    'campaignDescription', coalesce(gs.description, ct.module),
    'powers', to_jsonb(coalesce(public.boss_powers_of(p_user_id), '{}')),
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

-- Starts a battle the engine has allowed; Resolve is 3, or 4 for a Dwarf (Stalwart).
create or replace function public.boss_create_encounter(p_user_id uuid, p_campaign_id uuid, p_stage smallint, p_plan jsonb, p_origin text,
                                                        p_question_ids text[], p_max_resolve smallint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  v_id uuid;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id;
  if not found or v_campaign.status <> 'active' then raise exception 'campaign not active' using errcode = '42501'; end if;
  if p_max_resolve <> 3 + (case when 'stalwart' = any (coalesce(public.boss_powers_of(p_user_id), '{}')) then 1 else 0 end) then
    raise exception 'Resolve not allowed' using errcode = '42501';
  end if;
  if cardinality(p_question_ids) > 12 then raise exception 'too many questions' using errcode = '22023'; end if;
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

-- The current question of a battle, with its answer key (server only), its Weakness Bank record and
-- the player's powers.
create or replace function public.boss_answer_context(p_user_id uuid, p_encounter_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'powers', to_jsonb(coalesce(public.boss_powers_of(p_user_id), '{}')),
    'encounter', jsonb_build_object('id', e.id, 'campaignId', e.campaign_id, 'stage', e.stage, 'status', e.status, 'resolve', e.resolve,
                                    'maxResolve', e.max_resolve, 'position', e.position, 'questionIds', to_jsonb(e.question_ids),
                                    'plan', e.plan, 'planOrigin', e.plan_origin, 'answers', e.answers, 'endedAt', e.ended_at,
                                    'powersUsed', to_jsonb(e.powers_used), 'effects', e.effects),
    'item', (select jsonb_build_object('id', i.id, 'conceptId', i.concept_id, 'definition', i.definition)
             from public.assessment_items i where i.id = e.question_ids[e.position + 1]),
    'weakness', (select to_jsonb(w) from public.weakness_records w
                 where w.campaign_id = e.campaign_id and w.concept_id = (select i.concept_id from public.assessment_items i where i.id = e.question_ids[e.position + 1])))
  from public.boss_encounters e
  join public.campaigns c on c.id = e.campaign_id
  where e.id = p_encounter_id and e.user_id = p_user_id
$$;

-- Checks that a power is the player's own and not yet used in this battle.
create function public.boss_check_power(p_user_id uuid, e public.boss_encounters, p_power text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (p_power = any (coalesce(public.boss_powers_of(p_user_id), '{}'))) then raise exception 'not your power' using errcode = '42501'; end if;
  if p_power = any (e.powers_used) then raise exception 'power already used' using errcode = '42501'; end if;
end $$;

-- Checks a new question is from this course, not written, and not already in the battle.
create function public.boss_check_new_question(e public.boss_encounters, p_item_id text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_item_id is null or p_item_id = any (e.question_ids) or not exists (
      select 1 from public.assessment_items i join public.learning_activities la on la.id = i.activity_id
      join public.campaigns c on c.template_id = la.template_id
      where i.id = p_item_id and c.id = e.campaign_id and i.kind <> 'written') then
    raise exception 'question not allowed' using errcode = '42501';
  end if;
end $$;

-- Uses a power the player chose (Adaptable, Keen Insight, Scout Ahead, Gambit, Arcane Recall).
-- p_effect: {questionIds?, plan?, hint?, scout?, recall?}, as the engine decided.
create function public.boss_use_power(p_user_id uuid, p_encounter_id uuid, p_position integer, p_power text, p_effect jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.boss_encounters;
  v_ids text[];
  v_current text;
begin
  select * into e from public.boss_encounters where id = p_encounter_id and user_id = p_user_id for update;
  if not found then raise exception 'battle not found' using errcode = 'P0002'; end if;
  if e.status <> 'active' then raise exception 'battle is over' using errcode = '42501'; end if;
  if (select status from public.campaigns where id = e.campaign_id) <> 'active' then raise exception 'campaign not active' using errcode = '42501'; end if;
  if e.position <> p_position then raise exception 'answer out of order' using errcode = '40001'; end if;
  if p_power not in ('adaptable', 'keen_insight', 'scout_ahead', 'gambit', 'arcane_recall') then raise exception 'not a power to use' using errcode = '42501'; end if;
  perform public.boss_check_power(p_user_id, e, p_power);
  v_current := e.question_ids[e.position + 1];
  v_ids := e.question_ids;

  if p_power = 'adaptable' then
    -- Only the current question changes.
    v_ids := array(select jsonb_array_elements_text(p_effect -> 'questionIds'));
    if cardinality(v_ids) <> cardinality(e.question_ids)
       or exists (select 1 from generate_series(1, cardinality(v_ids)) k where k <> e.position + 1 and v_ids[k] <> e.question_ids[k]) then
      raise exception 'question list not allowed' using errcode = '42501';
    end if;
    perform public.boss_check_new_question(e, v_ids[e.position + 1]);
  elsif p_power = 'gambit' then
    -- The current question moves to the end; nothing else changes.
    v_ids := array(select jsonb_array_elements_text(p_effect -> 'questionIds'));
    if e.position + 1 >= cardinality(e.question_ids)
       or v_ids is distinct from (e.question_ids[1:e.position] || e.question_ids[e.position + 2:cardinality(e.question_ids)] || array[v_current]) then
      raise exception 'question list not allowed' using errcode = '42501';
    end if;
  end if;

  update public.boss_encounters set
    question_ids = v_ids,
    plan = case when p_effect ? 'plan' and jsonb_typeof(p_effect -> 'plan') = 'object' then p_effect -> 'plan' else plan end,
    powers_used = powers_used || p_power,
    effects = effects
      || case when p_power = 'keen_insight' then jsonb_build_object('hints', coalesce(effects -> 'hints', '{}') || jsonb_build_object(v_current, p_effect -> 'hint')) else '{}' end
      || case when p_power = 'scout_ahead' then jsonb_build_object('scout', p_effect -> 'scout') else '{}' end
      || case when p_power = 'arcane_recall' then jsonb_build_object('recall', jsonb_build_object('itemId', v_current, 'conceptId', (select concept_id from public.assessment_items where id = v_current))) else '{}' end
  where id = e.id;
end $$;

-- Records one answer exactly as the engine decided it, including an automatic power.
-- p_outcome: {itemId, conceptId, correct, given, resolve, status, power?, questionIds?, plan?, weakness?, xp?}
create or replace function public.boss_record_answer(p_user_id uuid, p_encounter_id uuid, p_position integer, p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.boss_encounters;
  w jsonb := p_outcome -> 'weakness';
  v_resolve smallint := (p_outcome ->> 'resolve')::smallint;
  v_status text := p_outcome ->> 'status';
  v_correct boolean := (p_outcome ->> 'correct')::boolean;
  v_power text := nullif(p_outcome ->> 'power', '');
  v_delta integer;
  v_ids text[];
  v_paid boolean := false;
begin
  select * into e from public.boss_encounters where id = p_encounter_id and user_id = p_user_id for update;
  if not found then raise exception 'battle not found' using errcode = 'P0002'; end if;
  if e.status <> 'active' then raise exception 'battle is over' using errcode = '42501'; end if;
  if e.position <> p_position or e.question_ids[e.position + 1] <> p_outcome ->> 'itemId' then
    raise exception 'answer out of order' using errcode = '40001';
  end if;

  v_ids := e.question_ids;
  if v_power is null then
    v_delta := case when v_correct then 0 else -1 end;
  else
    if v_power not in ('sanctuary', 'lucky', 'second_wind') then raise exception 'not an automatic power' using errcode = '42501'; end if;
    perform public.boss_check_power(p_user_id, e, v_power);
    if v_power = 'second_wind' and (not v_correct or e.resolve >= e.max_resolve) then raise exception 'power not allowed now' using errcode = '42501'; end if;
    if v_power in ('sanctuary', 'lucky') and v_correct then raise exception 'power not allowed now' using errcode = '42501'; end if;
    v_delta := case when v_power = 'second_wind' then 1 else 0 end;
    if v_power = 'lucky' then
      -- One new question, right after this one.
      v_ids := array(select jsonb_array_elements_text(p_outcome -> 'questionIds'));
      if cardinality(v_ids) <> cardinality(e.question_ids) + 1
         or v_ids[1:e.position + 1] is distinct from e.question_ids[1:e.position + 1]
         or v_ids[e.position + 3:cardinality(v_ids)] is distinct from e.question_ids[e.position + 2:cardinality(e.question_ids)] then
        raise exception 'question list not allowed' using errcode = '42501';
      end if;
      perform public.boss_check_new_question(e, v_ids[e.position + 2]);
    end if;
  end if;
  if v_resolve <> e.resolve + v_delta then raise exception 'Resolve not allowed' using errcode = '42501'; end if;
  if v_status <> (case when v_resolve <= 0 then 'lost' when e.position + 1 >= cardinality(v_ids) then 'won' else 'active' end) then
    raise exception 'battle result not allowed' using errcode = '42501';
  end if;

  update public.boss_encounters set
    question_ids = v_ids,
    plan = case when v_power = 'lucky' and jsonb_typeof(p_outcome -> 'plan') = 'object' then p_outcome -> 'plan' else plan end,
    powers_used = case when v_power is null then powers_used else powers_used || v_power end,
    position = e.position + 1,
    resolve = v_resolve,
    status = v_status,
    ended_at = case when v_status = 'active' then null else now() end,
    answers = e.answers || jsonb_build_array(jsonb_build_object('itemId', p_outcome ->> 'itemId', 'conceptId', p_outcome ->> 'conceptId',
                                                                'correct', v_correct, 'given', p_outcome -> 'given', 'power', v_power)),
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

revoke execute on function public.boss_powers_of(uuid), public.boss_check_power(uuid, public.boss_encounters, text),
  public.boss_check_new_question(public.boss_encounters, text), public.boss_use_power(uuid, uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.boss_powers_of(uuid), public.boss_check_power(uuid, public.boss_encounters, text),
  public.boss_check_new_question(public.boss_encounters, text), public.boss_use_power(uuid, uuid, integer, text, jsonb)
  to service_role;
