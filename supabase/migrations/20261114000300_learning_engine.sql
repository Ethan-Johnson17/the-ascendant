-- The Ascendant — learning engine (Phase 3, Milestone A)
--
-- Content: curricula (Subject → Discipline → Topic → Objective → Activity → Question), the
-- Knowledge Codex and the bibliography. Readable by anyone who can see the campaign template,
-- EXCEPT answer keys, which only server code can read.
--
-- Player records: lesson completions, check attempts (immutable once submitted), Codex progress
-- and the Weakness Bank. Players read their own rows and write none of them directly: every change
-- goes through the `learning` Edge Function, which runs the game engine and then calls the
-- service-role-only functions at the bottom of this file.

-- ─────────────────────────────────────────────────────────────── Content

create table public.curricula (
  template_id text primary key references public.campaign_templates on delete cascade,
  version integer not null check (version >= 1),
  subject text not null,
  origin text not null check (origin in ('authored', 'generated', 'fixture')),
  created_at timestamptz not null default now()
);

create table public.sources (
  id text primary key, -- '<template_id>/<key>'
  template_id text not null references public.curricula on delete cascade,
  key text not null,
  title text not null,
  author text,
  publisher text not null,
  url text check (url is null or url like 'https://%'),
  source_type text not null check (source_type in ('museum', 'university', 'textbook', 'peer_reviewed', 'primary_source', 'reference_work', 'organization')),
  publication_date text,
  verification_status text not null check (verification_status in ('verified', 'unverified')),
  checked_on date,
  unique (template_id, key)
);

create table public.curriculum_nodes (
  id text primary key, -- '<template_id>/<key>'
  template_id text not null references public.curricula on delete cascade,
  parent_id text references public.curriculum_nodes on delete cascade,
  kind text not null check (kind in ('discipline', 'topic', 'objective')),
  key text not null,
  title text not null,
  summary text not null default '',
  position integer not null check (position >= 0),
  unique (template_id, key),
  check ((kind = 'discipline') = (parent_id is null))
);
create index curriculum_nodes_parent_idx on public.curriculum_nodes (parent_id);

create table public.codex_entries (
  id text primary key, -- '<template_id>/<key>'
  template_id text not null references public.curricula on delete cascade,
  key text not null,
  title text not null,
  summary text not null,
  explanation text[] not null,
  examples text[] not null default '{}',
  applications text[] not null default '{}',
  related_ids text[] not null default '{}',
  competency_ids text[] not null check (cardinality(competency_ids) >= 1),
  certainty text not null check (certainty in ('established', 'consensus', 'debated', 'uncertain')),
  citations jsonb not null check (jsonb_typeof(citations) = 'array'),
  unique (template_id, key)
);

create table public.learning_activities (
  id text primary key, -- '<template_id>/<key>'
  template_id text not null references public.curricula on delete cascade,
  objective_id text not null references public.curriculum_nodes on delete cascade,
  key text not null,
  kind text not null check (kind in ('lesson', 'assessment')),
  title text not null,
  position integer not null check (position >= 0),
  competency_ids text[] not null check (cardinality(competency_ids) >= 1),
  -- Lessons
  estimated_minutes integer check (estimated_minutes between 1 and 120),
  sections jsonb check (sections is null or jsonb_typeof(sections) = 'array'),
  introduces_ids text[] not null default '{}',
  -- Checks
  target_stage smallint check (target_stage between 2 and 4),
  question_count integer check (question_count between 1 and 20),
  unique (template_id, key),
  check (
    (kind = 'lesson' and sections is not null and estimated_minutes is not null and target_stage is null and question_count is null)
    or (kind = 'assessment' and sections is null and target_stage is not null and question_count is not null)
  )
);
create index learning_activities_template_idx on public.learning_activities (template_id);

create table public.assessment_items (
  id text primary key, -- '<template_id>/<key>'
  activity_id text not null references public.learning_activities on delete cascade,
  key text not null,
  concept_id text not null references public.codex_entries on delete cascade,
  kind text not null check (kind in ('single_choice', 'ordering', 'matching')),
  difficulty smallint not null check (difficulty between 1 and 3),
  position integer not null check (position >= 0),
  -- The full engine definition INCLUDING THE ANSWER KEY. Never granted to players.
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  unique (activity_id, key)
);
create index assessment_items_activity_idx on public.assessment_items (activity_id);

-- ─────────────────────────────────────────────────────────────── Player records

alter table public.campaigns
  add column difficulty_preference smallint not null default 0 check (difficulty_preference between -1 and 1);

alter table public.competency_progress
  add column review_step smallint check (review_step >= 0),
  add column needs_review boolean not null default false,
  add column last_difficulty smallint check (last_difficulty between 1 and 3);

create table public.activity_completions (
  campaign_id uuid not null references public.campaigns on delete cascade,
  activity_id text not null references public.learning_activities, -- content that players used cannot be deleted
  user_id uuid not null references auth.users on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (campaign_id, activity_id)
);
create index activity_completions_user_idx on public.activity_completions (user_id);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  activity_id text not null references public.learning_activities, -- evidence outlives content edits
  curriculum_version integer not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  item_ids text[] not null check (cardinality(item_ids) between 1 and 20),
  -- What the player was shown (no answer keys).
  issued_items jsonb not null check (jsonb_typeof(issued_items) = 'array'),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb,
  -- Per question: correct, error category, the right answer and explanation (shown after marking).
  results jsonb,
  correct integer check (correct >= 0),
  total integer check (total >= 1),
  score real check (score between 0 and 1),
  passed boolean,
  check ((submitted_at is null) = (results is null) and (submitted_at is null) = (passed is null))
);
create index assessment_attempts_campaign_idx on public.assessment_attempts (campaign_id, activity_id);
create index assessment_attempts_user_idx on public.assessment_attempts (user_id, started_at);

-- Assessment evidence is permanent: once submitted, an attempt can never change.
create function public.guard_assessment_attempt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.submitted_at is not null then
    raise exception 'a submitted check cannot be changed' using errcode = '42501';
  end if;
  if new.id <> old.id or new.user_id <> old.user_id or new.campaign_id <> old.campaign_id
     or new.activity_id <> old.activity_id or new.item_ids <> old.item_ids or new.issued_items <> old.issued_items
     or new.started_at <> old.started_at or new.difficulty <> old.difficulty then
    raise exception 'only the submission of a check can be recorded' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger assessment_attempts_guard before update on public.assessment_attempts
  for each row execute function public.guard_assessment_attempt();

create table public.concept_progress (
  campaign_id uuid not null references public.campaigns on delete cascade,
  concept_id text not null references public.codex_entries,
  user_id uuid not null references auth.users on delete cascade,
  unlocked_at timestamptz,
  last_reviewed_at timestamptz,
  times_correct integer not null default 0 check (times_correct >= 0),
  times_incorrect integer not null default 0 check (times_incorrect >= 0),
  primary key (campaign_id, concept_id)
);
create index concept_progress_user_idx on public.concept_progress (user_id);

create table public.weakness_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  concept_id text not null references public.codex_entries,
  user_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('open', 'resolved')),
  error_category text not null check (error_category in (
    'misremembered_fact', 'conceptual_misunderstanding', 'incorrect_application', 'related_concept_confusion', 'incomplete_explanation'
  )),
  occurrence_count integer not null check (occurrence_count >= 1),
  correct_reviews integer not null default 0 check (correct_reviews >= 0),
  next_review_at timestamptz,
  last_mistake_at timestamptz not null,
  last_successful_review timestamptz,
  resolved_at timestamptz,
  incorrect_responses jsonb not null default '[]' check (jsonb_typeof(incorrect_responses) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, concept_id),
  check ((status = 'resolved') = (resolved_at is not null))
);
create index weakness_records_user_idx on public.weakness_records (user_id, status);

-- New XP kind: the first pass of each knowledge check.
alter table public.xp_transactions drop constraint xp_transactions_kind_check;
alter table public.xp_transactions add constraint xp_transactions_kind_check check (kind in (
  'lesson_completed', 'knowledge_check_passed', 'concept_explained', 'applied_problem_solved', 'practical_project_completed',
  'retention_review_passed', 'quest_completed', 'boss_defeated'
));

-- ─────────────────────────────────────────────────────────────── Trusted functions (service role)

-- Everything the engine needs to know about one competency for this player.
create function public.learning_competency_state(p_campaign_id uuid, p_competency_ids text[]) returns jsonb
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
      where a.campaign_id = p_campaign_id and a.passed
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
        where a.campaign_id = p_campaign_id and a.submitted_at is not null and cp.competency_id = any (la.competency_ids)
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

-- Context for starting a check.
create function public.learning_start_context(p_user_id uuid, p_campaign_id uuid, p_activity_id text) returns jsonb
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
    'activity', jsonb_build_object('id', v_activity.id, 'targetStage', v_activity.target_stage, 'questionCount', v_activity.question_count, 'competencyIds', to_jsonb(v_activity.competency_ids)),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'conceptId', i.concept_id, 'definition', i.definition) order by i.position)
                       from public.assessment_items i where i.activity_id = v_activity.id), '[]'),
    'competencies', public.learning_competency_state(p_campaign_id, v_activity.competency_ids),
    'weakConceptIds', coalesce((select jsonb_agg(w.concept_id) from public.weakness_records w where w.campaign_id = p_campaign_id and w.status = 'open'), '[]'),
    'recentAttempts', (select count(*) from public.assessment_attempts a where a.user_id = p_user_id and a.started_at > now() - interval '1 hour')
  );
end $$;

-- Records a check the engine has issued.
create function public.learning_create_attempt(
  p_user_id uuid, p_campaign_id uuid, p_activity_id text, p_item_ids text[], p_difficulty smallint, p_issued_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  v_activity public.learning_activities;
  v_id uuid;
  v_started timestamptz;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id for update;
  if not found or v_campaign.status <> 'active' then
    raise exception 'campaign not active' using errcode = '42501';
  end if;
  select * into v_activity from public.learning_activities
    where id = p_activity_id and template_id = v_campaign.template_id and kind = 'assessment';
  if not found then raise exception 'check not found' using errcode = 'P0002'; end if;
  -- Defence in depth: the engine has already applied these rules.
  if cardinality(p_item_ids) <> v_activity.question_count
     or (select count(distinct x) from unnest(p_item_ids) x) <> v_activity.question_count
     or exists (select 1 from unnest(p_item_ids) x where not exists (select 1 from public.assessment_items i where i.id = x and i.activity_id = p_activity_id)) then
    raise exception 'questions do not belong to this check' using errcode = '22023';
  end if;
  if exists (select 1 from public.competency_progress cp where cp.campaign_id = p_campaign_id
             and cp.competency_id = any (v_activity.competency_ids) and v_activity.target_stage > cp.mastery_stage + 1) then
    raise exception 'check is locked' using errcode = '42501';
  end if;
  insert into public.assessment_attempts (user_id, campaign_id, activity_id, curriculum_version, difficulty, item_ids, issued_items)
    values (p_user_id, p_campaign_id, p_activity_id, v_campaign.curriculum_version, p_difficulty, p_item_ids, p_issued_items)
    returning id, started_at into v_id, v_started;
  update public.campaigns set last_played_at = now() where id = p_campaign_id;
  return jsonb_build_object('attemptId', v_id, 'startedAt', v_started);
end $$;

-- Context for marking a submitted check.
create function public.learning_submit_context(p_user_id uuid, p_attempt_id uuid) returns jsonb
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
    'activity', jsonb_build_object('id', v_activity.id, 'targetStage', v_activity.target_stage, 'competencyIds', to_jsonb(v_activity.competency_ids)),
    -- Issued questions, in the order they were issued.
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

-- Records the engine's decision about a submitted check, atomically. Returns the XP keys paid.
create function public.learning_record_submission(p_user_id uuid, p_attempt_id uuid, p_outcome jsonb) returns jsonb
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
    passed = (p_outcome ->> 'passed')::boolean
  where id = p_attempt_id and user_id = p_user_id and submitted_at is null
  returning * into v_attempt;
  if not found then
    raise exception 'check not found or already submitted' using errcode = '23505';
  end if;
  if v_attempt.total <> cardinality(v_attempt.item_ids) or jsonb_array_length(v_attempt.results) <> v_attempt.total then
    raise exception 'results do not match the issued questions' using errcode = '22023';
  end if;
  select * into v_activity from public.learning_activities where id = v_attempt.activity_id;

  for c in select * from jsonb_array_elements(p_outcome -> 'competencies') loop
    if not (c ->> 'competencyId') = any (v_activity.competency_ids) then
      raise exception 'competency is not covered by this check' using errcode = '22023';
    end if;
    select mastery_stage into v_old_stage from public.competency_progress
      where campaign_id = v_attempt.campaign_id and competency_id = c ->> 'competencyId' for update;
    v_new_stage := (c ->> 'stage')::smallint;
    -- A check can raise a stage by one, only on a pass, only up to Proficient; nothing lowers one.
    if v_new_stage < v_old_stage or v_new_stage > v_old_stage + 1 or v_new_stage > 4
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

-- Context for completing a lesson.
create function public.learning_lesson_context(p_user_id uuid, p_campaign_id uuid, p_activity_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('campaignStatus', c.status, 'lessonId', la.id,
                            'alreadyCompleted', exists (select 1 from public.activity_completions ac where ac.campaign_id = c.id and ac.activity_id = la.id))
  from public.campaigns c
  join public.learning_activities la on la.template_id = c.template_id and la.id = p_activity_id and la.kind = 'lesson'
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Records a completed lesson: unlocks its Codex entries and pays first-completion XP.
create function public.learning_record_lesson(p_user_id uuid, p_campaign_id uuid, p_activity_id text, p_xp jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns;
  v_activity public.learning_activities;
  v_paid boolean;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id and user_id = p_user_id;
  if not found or v_campaign.status <> 'active' then raise exception 'campaign not active' using errcode = '42501'; end if;
  select * into v_activity from public.learning_activities where id = p_activity_id and template_id = v_campaign.template_id and kind = 'lesson';
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  if p_xp ->> 'kind' <> 'lesson_completed' or p_xp ->> 'sourceId' <> p_activity_id then
    raise exception 'XP not allowed for this lesson' using errcode = '42501';
  end if;

  insert into public.activity_completions (campaign_id, activity_id, user_id) values (p_campaign_id, p_activity_id, p_user_id)
    on conflict do nothing;
  insert into public.concept_progress (campaign_id, concept_id, user_id, unlocked_at)
    select p_campaign_id, x, p_user_id, now() from unnest(v_activity.introduces_ids) x
    on conflict (campaign_id, concept_id) do update set unlocked_at = coalesce(public.concept_progress.unlocked_at, excluded.unlocked_at);
  v_paid := public.apply_xp_award(p_user_id, p_campaign_id, 'lesson_completed', p_activity_id, (p_xp ->> 'amount')::integer,
                                  p_xp ->> 'idempotencyKey', p_xp ->> 'configVersion');
  update public.campaigns set last_played_at = now() where id = p_campaign_id;
  return jsonb_build_object('xpPaid', case when v_paid then jsonb_build_array(p_xp ->> 'idempotencyKey') else '[]'::jsonb end);
end $$;

-- ─────────────────────────────────────────────────────────────── Privileges

revoke all on public.curricula, public.sources, public.curriculum_nodes, public.codex_entries, public.learning_activities,
  public.assessment_items, public.activity_completions, public.assessment_attempts, public.concept_progress,
  public.weakness_records from anon, authenticated;
revoke execute on function public.guard_assessment_attempt(), public.learning_competency_state(uuid, text[]),
  public.learning_start_context(uuid, uuid, text), public.learning_create_attempt(uuid, uuid, text, text[], smallint, jsonb),
  public.learning_submit_context(uuid, uuid), public.learning_record_submission(uuid, uuid, jsonb),
  public.learning_lesson_context(uuid, uuid, text), public.learning_record_lesson(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

grant select on public.curricula, public.sources, public.curriculum_nodes, public.codex_entries, public.learning_activities
  to anon, authenticated;
-- Questions: players may see which questions exist, never their wording or answers outside an attempt.
grant select (id, activity_id, key, concept_id, kind, difficulty, position) on public.assessment_items to anon, authenticated;

grant select on public.activity_completions, public.assessment_attempts, public.concept_progress, public.weakness_records to authenticated;
grant update (difficulty_preference) on public.campaigns to authenticated;

grant execute on function public.learning_start_context(uuid, uuid, text), public.learning_create_attempt(uuid, uuid, text, text[], smallint, jsonb),
  public.learning_submit_context(uuid, uuid), public.learning_record_submission(uuid, uuid, jsonb),
  public.learning_lesson_context(uuid, uuid, text), public.learning_record_lesson(uuid, uuid, text, jsonb)
  to service_role;

-- ─────────────────────────────────────────────────────────────── Row Level Security

alter table public.curricula enable row level security;
alter table public.sources enable row level security;
alter table public.curriculum_nodes enable row level security;
alter table public.codex_entries enable row level security;
alter table public.learning_activities enable row level security;
alter table public.assessment_items enable row level security;

create policy "curricula of visible templates" on public.curricula for select to anon, authenticated
  using (exists (select 1 from public.campaign_templates t where t.id = template_id));
create policy "sources of visible curricula" on public.sources for select to anon, authenticated
  using (exists (select 1 from public.curricula c where c.template_id = sources.template_id));
create policy "nodes of visible curricula" on public.curriculum_nodes for select to anon, authenticated
  using (exists (select 1 from public.curricula c where c.template_id = curriculum_nodes.template_id));
create policy "codex of visible curricula" on public.codex_entries for select to anon, authenticated
  using (exists (select 1 from public.curricula c where c.template_id = codex_entries.template_id));
create policy "activities of visible curricula" on public.learning_activities for select to anon, authenticated
  using (exists (select 1 from public.curricula c where c.template_id = learning_activities.template_id));
create policy "questions of visible activities" on public.assessment_items for select to anon, authenticated
  using (exists (select 1 from public.learning_activities a where a.id = activity_id));

alter table public.activity_completions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.concept_progress enable row level security;
alter table public.weakness_records enable row level security;

create policy "own completions" on public.activity_completions for select to authenticated using (user_id = (select auth.uid()));
create policy "own attempts" on public.assessment_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy "own concept progress" on public.concept_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "own weaknesses" on public.weakness_records for select to authenticated using (user_id = (select auth.uid()));
