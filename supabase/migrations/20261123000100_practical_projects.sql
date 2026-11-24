-- The Ascendant — Phase 5 Part C2: practical projects.
--
-- A practical project is one written task for a topic, marked by the Examiner (AI) against a rubric
-- (GAME_DESIGN.md "Practical projects", decided 2026-11-17 and 2026-11-23). It is stored as a check
-- marked `is_project`, proving Advanced (stage 5), so it reuses checks' marking, "doesn't count"
-- rule, Weakness Bank and boss gates. Differences, enforced here as well as by the engine:
--   * a passed project counts as ONE pass toward Advanced, once per competency: the second pass
--     must come from an Advanced check;
--   * it pays the project reward (practical_project_completed) once, never the check or review reward.
-- For AI-made courses the Course Builder writes the project once, when every lesson is built and
-- every skill the lessons teach is Proficient.

alter table public.learning_activities add column is_project boolean not null default false;
alter table public.learning_activities add constraint learning_activities_project_check
  check (not is_project or (kind = 'assessment' and target_stage = 5 and question_count = 1 and written_count = 1));

-- ─────────────────────────────────────────────────────────────── Competency state

-- As before, plus: project passes count once per competency (the earliest), and `projectPassed`.
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
    -- Passes of checks written for the next stage; at most one project pass.
    'passTimesForNext', coalesce((
      select jsonb_agg(p.t order by p.t) from (
        select a.submitted_at as t
        from public.assessment_attempts a
        join public.learning_activities la on la.id = a.activity_id
        where a.campaign_id = p_campaign_id and a.passed and a.counted and not la.is_project
          and la.target_stage = cp.mastery_stage + 1 and cp.competency_id = any (la.competency_ids)
        union all
        select min(a.submitted_at)
        from public.assessment_attempts a
        join public.learning_activities la on la.id = a.activity_id
        where a.campaign_id = p_campaign_id and a.passed and a.counted and la.is_project
          and la.target_stage = cp.mastery_stage + 1 and cp.competency_id = any (la.competency_ids)
        having min(a.submitted_at) is not null
      ) p
    ), '[]'),
    'projectPassed', exists (
      select 1 from public.assessment_attempts a join public.learning_activities la on la.id = a.activity_id
      where a.campaign_id = p_campaign_id and a.passed and a.counted and la.is_project and cp.competency_id = any (la.competency_ids)),
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

-- As before, plus the activity's `isProject`.
create or replace function public.learning_submit_context(p_user_id uuid, p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_attempt public.assessment_attempts;
  v_activity public.learning_activities;
  v_concepts text[];
begin
  select * into v_attempt from public.assessment_attempts where id = p_attempt_id and user_id = p_user_id;
  if not found then return null; end if;
  select * into v_activity from public.learning_activities where id = v_attempt.activity_id;
  select array_agg(distinct i.concept_id) into v_concepts from public.assessment_items i where i.id = any (v_attempt.item_ids);
  return jsonb_build_object(
    'campaignId', v_attempt.campaign_id,
    'attempt', jsonb_build_object('id', v_attempt.id, 'submitted', v_attempt.submitted_at is not null, 'difficulty', v_attempt.difficulty, 'startedAt', v_attempt.started_at),
    'activity', jsonb_build_object('id', v_activity.id, 'targetStage', v_activity.target_stage, 'competencyIds', to_jsonb(v_activity.competency_ids),
                                   'isProject', v_activity.is_project),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'conceptId', i.concept_id, 'definition', i.definition) order by x.n)
                       from unnest(v_attempt.item_ids) with ordinality as x(item_id, n)
                       join public.assessment_items i on i.id = x.item_id), '[]'),
    'competencies', public.learning_competency_state(v_attempt.campaign_id, v_activity.competency_ids),
    'weaknesses', coalesce((select jsonb_agg(to_jsonb(w)) from public.weakness_records w
                            where w.campaign_id = v_attempt.campaign_id and w.concept_id = any (v_concepts)), '[]'),
    'standings', coalesce((select jsonb_agg(jsonb_build_object('competencyId', cp.competency_id, 'attribute', cd.attribute, 'stage', cp.mastery_stage))
                           from public.competency_progress cp join public.competency_definitions cd on cd.id = cp.competency_id
                           where cp.user_id = p_user_id), '[]')
  );
end $$;

-- As in 20261116000200, plus the project rules (marked "Projects").
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
    if v_new_stage < v_old_stage or v_new_stage > v_old_stage + 1 or v_new_stage > 5
       or (v_new_stage = 5 and v_new_stage > v_old_stage and (not v_has_written or v_attempt.marking is null))
       or (v_new_stage > v_old_stage and (not v_attempt.passed or v_activity.target_stage <> v_new_stage)) then
      raise exception 'mastery change refused' using errcode = '42501';
    end if;
    -- Projects: a stage rise needs a pass that isn't from a project, besides at most one project pass.
    if v_new_stage > v_old_stage and not exists (
         select 1 from public.assessment_attempts a join public.learning_activities la on la.id = a.activity_id
         where a.campaign_id = v_attempt.campaign_id and a.passed and a.counted and not la.is_project
           and la.target_stage = v_new_stage and (c ->> 'competencyId') = any (la.competency_ids)) then
      raise exception 'mastery change refused: a project counts as one pass only' using errcode = '42501';
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
    -- Projects pay the project reward only; checks never pay it.
    if not v_attempt.passed
       or (v_activity.is_project and (x ->> 'kind') <> 'practical_project_completed')
       or (not v_activity.is_project and (x ->> 'kind') not in ('knowledge_check_passed', 'retention_review_passed'))
       or ((x ->> 'kind') = 'practical_project_completed' and (x ->> 'sourceId') <> v_activity.id) then
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

-- ─────────────────────────────────────────────────────────────── AI-made courses

-- What the Course Builder needs to write a course's project (null if there is no such subject).
create function public.ai_project_context(p_user_id uuid, p_template_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignId', c.id,
    'campaignStatus', c.status,
    'closed', g.closed_at is not null,
    'allBuilt', not exists (select 1 from jsonb_array_elements(g.outline -> 'lessons') l where not (l ->> 'built')::boolean),
    'hasProject', exists (select 1 from public.learning_activities a where a.template_id = g.template_id and a.is_project),
    'title', ct.title,
    'topicId', (select n.id from public.curriculum_nodes n where n.template_id = g.template_id and n.kind = 'topic' order by n.position limit 1),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'sections', a.sections, 'competencyId', a.competency_ids[1]) order by o.position)
                         from public.learning_activities a join public.curriculum_nodes o on o.id = a.objective_id
                         where a.template_id = g.template_id and a.kind = 'lesson'), '[]'::jsonb),
    'codex', coalesce((select jsonb_agg(jsonb_build_object('key', ce.key, 'title', ce.title) order by ce.key)
                       from public.codex_entries ce where ce.template_id = g.template_id), '[]'::jsonb),
    'competencies', coalesce((select jsonb_agg(jsonb_build_object('id', cd.id, 'name', cd.name,
                                'stage', coalesce((select cp.mastery_stage from public.competency_progress cp where cp.campaign_id = c.id and cp.competency_id = cd.id), 1))
                                order by cd.id)
                              from public.competency_definitions cd
                              where cd.id in (select unnest(a.competency_ids) from public.learning_activities a where a.template_id = g.template_id and a.kind = 'lesson')), '[]'::jsonb))
  from public.generated_subjects g
  join public.campaign_templates ct on ct.id = g.template_id
  left join public.campaigns c on c.id = g.campaign_id
  where g.template_id = p_template_id and g.user_id = p_user_id
$$;

-- Saves a course's one project: its objective, the project and its task. Only once, only when every
-- lesson is built and every skill the lessons teach is Proficient.
create function public.ai_save_project(p_user_id uuid, p_template_id text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t text := p_template_id;
  g public.generated_subjects;
  n jsonb := p_rows -> 'node';
  a jsonb := p_rows -> 'activity';
  i jsonb := p_rows -> 'item';
  v_comps text[];
  v_topic text;
begin
  select * into g from public.generated_subjects where template_id = t and user_id = p_user_id and closed_at is null for update;
  if not found then raise exception 'subject not found' using errcode = '42501'; end if;
  if not exists (select 1 from public.campaigns where id = g.campaign_id and status = 'active') then
    raise exception 'campaign not active' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(g.outline -> 'lessons') l where not (l ->> 'built')::boolean) then
    raise exception 'build every lesson first' using errcode = '22023';
  end if;
  if exists (select 1 from public.learning_activities where template_id = t and is_project) then
    raise exception 'this course already has its project' using errcode = '23505';
  end if;
  select array_agg(distinct x order by x) into v_comps
    from public.learning_activities la, unnest(la.competency_ids) x where la.template_id = t and la.kind = 'lesson';
  if v_comps is null or exists (
       select 1 from unnest(v_comps) x
       where coalesce((select cp.mastery_stage from public.competency_progress cp where cp.campaign_id = g.campaign_id and cp.competency_id = x), 1) < 4) then
    raise exception 'every skill must be Proficient first' using errcode = '42501';
  end if;
  select id into v_topic from public.curriculum_nodes where template_id = t and kind = 'topic' order by position limit 1;

  -- The rows must be exactly this course's project.
  if n ->> 'id' <> t || '/project-goal' or n ->> 'key' <> 'project-goal' or n ->> 'template_id' <> t or n ->> 'kind' <> 'objective'
     or n ->> 'parent_id' <> v_topic
     or a ->> 'id' <> t || '/project' or a ->> 'key' <> 'project' or a ->> 'template_id' <> t or a ->> 'objective_id' <> t || '/project-goal'
     or a ->> 'kind' <> 'assessment' or not (a ->> 'is_project')::boolean or (a ->> 'target_stage')::smallint <> 5
     or (a ->> 'question_count')::integer <> 1 or (a ->> 'written_count')::integer <> 1
     or a -> 'competency_ids' <> to_jsonb(v_comps)
     or i ->> 'id' <> t || '/project-task' or i ->> 'key' <> 'project-task' or i ->> 'activity_id' <> t || '/project' or i ->> 'kind' <> 'written'
     or not exists (select 1 from public.codex_entries ce where ce.template_id = t and ce.id = i ->> 'concept_id') then
    raise exception 'content belongs to another course' using errcode = '42501';
  end if;

  insert into public.curriculum_nodes select * from jsonb_populate_record(null::public.curriculum_nodes, n);
  insert into public.learning_activities select * from jsonb_populate_record(null::public.learning_activities, a);
  insert into public.assessment_items select * from jsonb_populate_record(null::public.assessment_items, i);
end $$;

revoke execute on function public.ai_project_context(uuid, text), public.ai_save_project(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ai_project_context(uuid, text), public.ai_save_project(uuid, text, jsonb) to service_role;
