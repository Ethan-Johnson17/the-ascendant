-- The Ascendant — Phase 4 Milestone B: written answers marked by the Examiner.
--
-- Written questions are stored like other questions (their rubric and model answer stay in the
-- hidden `definition` column). A check says how many written questions it issues. An attempt whose
-- written answers could not be marked confidently is recorded but "doesn't count": it changes no
-- mastery, retention, Weakness Bank, attributes or XP (GAME_DESIGN.md "AI rules").

alter table public.assessment_items drop constraint assessment_items_kind_check;
alter table public.assessment_items add constraint assessment_items_kind_check
  check (kind in ('single_choice', 'ordering', 'matching', 'written'));

-- Stage 5 (Advanced) checks need written work.
alter table public.learning_activities drop constraint learning_activities_target_stage_check;
alter table public.learning_activities add constraint learning_activities_target_stage_check check (target_stage between 2 and 5);
alter table public.learning_activities add column written_count smallint not null default 0;
alter table public.learning_activities add constraint learning_activities_written_count_check
  check (written_count between 0 and 5 and (kind = 'assessment' or written_count = 0) and (question_count is null or written_count <= question_count));

alter table public.assessment_attempts
  add column counted boolean not null default true,
  -- The Examiner's checked judgement of each written answer (criteria met, quotes, confidence,
  -- feedback, provider and model). Never the prompt.
  add column marking jsonb check (marking is null or jsonb_typeof(marking) = 'object'),
  add constraint assessment_attempts_uncounted_not_passed check (counted or passed is distinct from true);

-- ─────────────────────────────────────────────────────────────── Functions

-- Uncounted attempts are left out of recent results (they say nothing reliable about the player).
create or replace function public.learning_competency_state(p_campaign_id uuid, p_competency_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'competencyId', cp.competency_id,
    'stage', cp.mastery_stage,
    'reviewStep', cp.review_step,
    'nextReviewAt', cp.next_review_at,
    'needsReview', cp.needs_review,
    'lastDemonstratedAt', cp.last_demonstrated_at,
    'lastDifficulty', cp.last_difficulty,
    -- Passes of checks written for the next stage.
    'passTimesForNext', coalesce((
      select jsonb_agg(a.submitted_at order by a.submitted_at)
      from public.assessment_attempts a
      join public.learning_activities la on la.id = a.activity_id
      where a.campaign_id = p_campaign_id and a.passed and a.counted
        and la.target_stage = cp.mastery_stage + 1 and cp.competency_id = any (la.competency_ids)
    ), '[]'),
    -- Recent per-question results in this competency, newest first.
    'recentResults', coalesce((
      select jsonb_agg(x.correct order by x.ord)
      from (
        select (r ->> 'correct')::boolean as correct, row_number() over (order by a.submitted_at desc, e.n) as ord
        from public.assessment_attempts a
        join public.learning_activities la on la.id = a.activity_id
        cross join lateral jsonb_array_elements(a.results) with ordinality as e(r, n)
        where a.campaign_id = p_campaign_id and a.submitted_at is not null and a.counted and cp.competency_id = any (la.competency_ids)
        order by a.submitted_at desc, e.n
        limit 20
      ) x
    ), '[]'),
    'openWeaknesses', (
      select count(*) from public.weakness_records w
      join public.codex_entries ce on ce.id = w.concept_id
      where w.campaign_id = p_campaign_id and w.status = 'open' and cp.competency_id = any (ce.competency_ids)
    )
  ) order by cp.competency_id), '[]')
  from public.competency_progress cp
  where cp.campaign_id = p_campaign_id and cp.competency_id = any (p_competency_ids)
$$;

create or replace function public.learning_start_context(p_user_id uuid, p_campaign_id uuid, p_activity_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  v_activity public.learning_activities;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id;
  if not found then return null; end if;
  select * into v_activity from public.learning_activities
    where id = p_activity_id and template_id = v_campaign.template_id and kind = 'assessment';
  if not found then return null; end if;
  return jsonb_build_object(
    'campaignStatus', v_campaign.status,
    'preference', v_campaign.difficulty_preference,
    'activity', jsonb_build_object('id', v_activity.id, 'targetStage', v_activity.target_stage, 'questionCount', v_activity.question_count,
                                   'writtenCount', v_activity.written_count, 'competencyIds', to_jsonb(v_activity.competency_ids)),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'conceptId', i.concept_id, 'definition', i.definition) order by i.position)
                       from public.assessment_items i where i.activity_id = v_activity.id), '[]'),
    'competencies', public.learning_competency_state(p_campaign_id, v_activity.competency_ids),
    'weakConceptIds', coalesce((select jsonb_agg(w.concept_id) from public.weakness_records w where w.campaign_id = p_campaign_id and w.status = 'open'), '[]'),
    'recentAttempts', (select count(*) from public.assessment_attempts a where a.user_id = p_user_id and a.started_at > now() - interval '1 hour')
  );
end $$;

-- Records the engine's decision about a submitted check, atomically. Returns the XP keys paid.
create or replace function public.learning_record_submission(p_user_id uuid, p_attempt_id uuid, p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.assessment_attempts;
  v_activity public.learning_activities;
  c jsonb;
  w jsonb;
  x jsonb;
  r jsonb;
  v_old_stage smallint;
  v_new_stage smallint;
  v_paid jsonb := '[]';
  v_attrs jsonb := p_outcome -> 'attributes';
  v_counted boolean := coalesce((p_outcome ->> 'counted')::boolean, true);
  v_has_written boolean;
begin
  -- The engine's clock decided the outcome, so it is the time recorded; it may not predate the attempt.
  if (p_outcome ->> 'submittedAt')::timestamptz < (select started_at from public.assessment_attempts where id = p_attempt_id) - interval '5 minutes' then
    raise exception 'submission time is before the check started' using errcode = '22023';
  end if;
  update public.assessment_attempts set
    submitted_at = coalesce((p_outcome ->> 'submittedAt')::timestamptz, now()),
    answers = p_outcome -> 'answers',
    results = p_outcome -> 'results',
    correct = (p_outcome ->> 'correct')::integer,
    total = (p_outcome ->> 'total')::integer,
    score = (p_outcome ->> 'score')::real,
    passed = (p_outcome ->> 'passed')::boolean,
    counted = v_counted,
    marking = case when jsonb_typeof(p_outcome -> 'marking') = 'object' then p_outcome -> 'marking' end
  where id = p_attempt_id and user_id = p_user_id and submitted_at is null
  returning * into v_attempt;
  if not found then
    raise exception 'check not found or already submitted' using errcode = '23505';
  end if;
  if v_attempt.total <> cardinality(v_attempt.item_ids) or jsonb_array_length(v_attempt.results) <> v_attempt.total then
    raise exception 'results do not match the issued questions' using errcode = '22023';
  end if;
  select * into v_activity from public.learning_activities where id = v_attempt.activity_id;
  select exists (select 1 from public.assessment_items i where i.id = any (v_attempt.item_ids) and i.kind = 'written') into v_has_written;

  -- An attempt that didn't count changes nothing else.
  if not v_counted then
    if v_attempt.passed or jsonb_array_length(coalesce(p_outcome -> 'competencies', '[]')) > 0
       or jsonb_array_length(coalesce(p_outcome -> 'weaknesses', '[]')) > 0 or jsonb_array_length(coalesce(p_outcome -> 'xp', '[]')) > 0 then
      raise exception 'an uncounted check cannot change progress' using errcode = '42501';
    end if;
    update public.campaigns set last_played_at = now() where id = v_attempt.campaign_id;
    return jsonb_build_object('submittedAt', v_attempt.submitted_at, 'xpPaid', v_paid);
  end if;
  -- A check with written answers that were answered must carry the Examiner's marking.
  if v_has_written and v_attempt.marking is null
     and exists (select 1 from public.assessment_items i where i.id = any (v_attempt.item_ids) and i.kind = 'written'
                 and coalesce(btrim(v_attempt.answers ->> i.id), '') <> '') then
    raise exception 'written answers need the Examiner''s marking' using errcode = '42501';
  end if;

  for c in select * from jsonb_array_elements(p_outcome -> 'competencies') loop
    if not (c ->> 'competencyId') = any (v_activity.competency_ids) then
      raise exception 'competency is not covered by this check' using errcode = '22023';
    end if;
    select mastery_stage into v_old_stage from public.competency_progress
      where campaign_id = v_attempt.campaign_id and competency_id = c ->> 'competencyId' for update;
    v_new_stage := (c ->> 'stage')::smallint;
    -- A check can raise a stage by one, only on a pass of that stage's check. Self-marked checks stop
    -- at Proficient (4); Advanced (5) needs a passed check with Examiner-marked written answers.
    if v_new_stage < v_old_stage or v_new_stage > v_old_stage + 1 or v_new_stage > 5
       or (v_new_stage = 5 and v_new_stage > v_old_stage and (not v_has_written or v_attempt.marking is null))
       or (v_new_stage > v_old_stage and (not v_attempt.passed or v_activity.target_stage <> v_new_stage)) then
      raise exception 'mastery change refused' using errcode = '42501';
    end if;
    update public.competency_progress set
      mastery_stage = v_new_stage,
      evidence_count = evidence_count + case when (c ->> 'evidence')::boolean then 1 else 0 end,
      review_step = (c ->> 'reviewStep')::smallint,
      next_review_at = (c ->> 'nextReviewAt')::timestamptz,
      needs_review = (c ->> 'needsReview')::boolean,
      last_demonstrated_at = (c ->> 'lastDemonstratedAt')::timestamptz,
      retention_strength = (c ->> 'retentionStrength')::real,
      last_difficulty = v_attempt.difficulty
    where campaign_id = v_attempt.campaign_id and competency_id = c ->> 'competencyId';
  end loop;

  for w in select * from jsonb_array_elements(p_outcome -> 'weaknesses') loop
    if not exists (select 1 from public.assessment_items i where i.id = any (v_attempt.item_ids) and i.concept_id = w ->> 'conceptId') then
      raise exception 'weakness concept was not tested' using errcode = '22023';
    end if;
    insert into public.weakness_records as wr (campaign_id, concept_id, user_id, status, error_category, occurrence_count,
        correct_reviews, next_review_at, last_mistake_at, last_successful_review, resolved_at, incorrect_responses)
      values (v_attempt.campaign_id, w ->> 'conceptId', p_user_id, w ->> 'status', w ->> 'errorCategory', (w ->> 'occurrenceCount')::integer,
        (w ->> 'correctReviews')::integer, (w ->> 'nextReviewAt')::timestamptz, (w ->> 'lastMistakeAt')::timestamptz,
        (w ->> 'lastSuccessfulReview')::timestamptz, (w ->> 'resolvedAt')::timestamptz, w -> 'incorrectResponses')
      on conflict (campaign_id, concept_id) do update set
        status = excluded.status, error_category = excluded.error_category, occurrence_count = excluded.occurrence_count,
        correct_reviews = excluded.correct_reviews, next_review_at = excluded.next_review_at, last_mistake_at = excluded.last_mistake_at,
        last_successful_review = excluded.last_successful_review, resolved_at = excluded.resolved_at,
        incorrect_responses = excluded.incorrect_responses, updated_at = now();
  end loop;

  for r in select * from jsonb_array_elements(v_attempt.results) loop
    insert into public.concept_progress (campaign_id, concept_id, user_id, last_reviewed_at, times_correct, times_incorrect)
      values (v_attempt.campaign_id, r ->> 'conceptId', p_user_id, now(),
              case when (r ->> 'correct')::boolean then 1 else 0 end, case when (r ->> 'correct')::boolean then 0 else 1 end)
      on conflict (campaign_id, concept_id) do update set
        last_reviewed_at = now(),
        times_correct = public.concept_progress.times_correct + excluded.times_correct,
        times_incorrect = public.concept_progress.times_incorrect + excluded.times_incorrect;
  end loop;

  update public.characters set
    strength = (v_attrs ->> 'str')::smallint, dexterity = (v_attrs ->> 'dex')::smallint, constitution = (v_attrs ->> 'con')::smallint,
    intelligence = (v_attrs ->> 'int')::smallint, wisdom = (v_attrs ->> 'wis')::smallint, charisma = (v_attrs ->> 'cha')::smallint
  where user_id = p_user_id;

  for x in select * from jsonb_array_elements(p_outcome -> 'xp') loop
    if (x ->> 'kind') not in ('knowledge_check_passed', 'retention_review_passed') or not v_attempt.passed then
      raise exception 'XP not allowed for this check' using errcode = '42501';
    end if;
    if public.apply_xp_award(p_user_id, v_attempt.campaign_id, x ->> 'kind', x ->> 'sourceId', (x ->> 'amount')::integer,
                             x ->> 'idempotencyKey', x ->> 'configVersion') then
      v_paid := v_paid || to_jsonb(x ->> 'idempotencyKey');
    end if;
  end loop;

  update public.campaigns set last_played_at = now() where id = v_attempt.campaign_id;
  return jsonb_build_object('submittedAt', v_attempt.submitted_at, 'xpPaid', v_paid);
end $$;

-- Titles of the activities a Progression Advisor plan names, so the Advisor never sees player text.
create function public.ai_advisor_context(p_user_id uuid, p_campaign_id uuid, p_activity_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignTitle', (select ct.title from public.campaign_templates ct where ct.id = c.template_id),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object('id', la.id, 'kind', la.kind, 'title', la.title, 'targetStage', la.target_stage))
      from public.learning_activities la where la.template_id = c.template_id and la.id = any (p_activity_ids)), '[]'::jsonb))
  from public.campaigns c
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

revoke execute on function public.ai_advisor_context(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.ai_advisor_context(uuid, uuid, text[]) to service_role;
