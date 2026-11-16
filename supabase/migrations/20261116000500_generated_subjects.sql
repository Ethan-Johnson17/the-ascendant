-- The Ascendant — Phase 4 Milestone C, part 2: "Start a new subject".
--
-- A player's AI-made subject is an ordinary campaign template they own (owner_user_id), with its
-- own curriculum (origin 'generated', or 'fixture' in development). The Course Builder (AI) plans
-- 4 lessons; each lesson and its check is written later, from a Wikipedia article the server
-- fetches, and saved only after the server has checked every quote and the engine's curriculum
-- validator has accepted it. Only the `ai` Edge Function (service role) writes course content.
-- Players read their own subjects, report mistakes, and close a subject to free a slot. Closing
-- never deletes anything: XP and learning records are permanent (GAME_DESIGN.md).

-- ─────────────────────────────────────────────────────────────── The Course Builder role

alter table public.ai_requests drop constraint ai_requests_role_check;
alter table public.ai_requests add constraint ai_requests_role_check
  check (role in ('game_master', 'tutor', 'examiner', 'strategist', 'researcher', 'progression_advisor', 'course_builder'));

-- ─────────────────────────────────────────────────────────────── Subjects

create table public.generated_subjects (
  template_id text primary key references public.campaign_templates on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  description text not null check (char_length(description) between 1 and 400),
  -- Health, law and money courses are labelled "for learning, not personal advice".
  advice_area text not null check (advice_area in ('none', 'health', 'law', 'money')),
  -- The player's own request (subject, goal, starting level).
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  -- The plan: { lessons: [{ key, title, summary, competency, article {title,url,pageId}, source, built }] }.
  outline jsonb not null check (jsonb_typeof(outline -> 'lessons') = 'array'),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index generated_subjects_user on public.generated_subjects (user_id) where closed_at is null;

alter table public.generated_subjects enable row level security;
create policy "players read their own subjects" on public.generated_subjects for select to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────── Mistake reports

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  activity_id text not null references public.learning_activities on delete cascade,
  message text not null check (char_length(btrim(message)) between 5 and 1000),
  created_at timestamptz not null default now(),
  -- One report per lesson per player (stops accidental floods); it can be read back, not edited.
  unique (user_id, activity_id)
);
create index content_reports_activity on public.content_reports (activity_id);

alter table public.content_reports enable row level security;
create policy "players read their own reports" on public.content_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "players report lessons in their own campaigns" on public.content_reports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.learning_activities a join public.campaigns c on c.template_id = a.template_id
                where a.id = activity_id and a.kind = 'lesson' and c.user_id = (select auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────── Service-role functions

-- How many AI-made subjects the player has open.
create function public.ai_subject_slots(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('open', count(*)) from public.generated_subjects where user_id = p_user_id and closed_at is null
$$;

-- Saves a planned subject and starts its campaign. Every id must belong to the new template.
create function public.ai_create_subject(p_user_id uuid, p_max_open integer, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text := p_rows -> 'template' ->> 'id';
  v_campaign uuid;
  v_open integer;
begin
  -- One creation at a time per player, so two quick clicks can't pass the limit together.
  perform pg_advisory_xact_lock(hashtext('generated-subjects:' || p_user_id::text));
  select count(*) into v_open from public.generated_subjects where user_id = p_user_id and closed_at is null;
  if v_open >= p_max_open then raise exception 'subject limit reached' using errcode = 'AS001'; end if;
  if t is null or t !~ '^ai-[a-z0-9]{6,40}$' then raise exception 'bad template id' using errcode = '22023'; end if;
  if not exists (select 1 from public.characters where user_id = p_user_id) then raise exception 'no character' using errcode = '42501'; end if;

  if (select count(distinct x ->> 'attribute') from jsonb_array_elements(p_rows -> 'subSkills') x) <> 6
     or jsonb_array_length(p_rows -> 'subSkills') <> 6
     or jsonb_array_length(p_rows -> 'competencies') not between 1 and 3
     or jsonb_array_length(p_rows -> 'sources') not between 1 and 4
     or jsonb_array_length(p_rows -> 'nodes') not between 3 and 6
     or jsonb_array_length(p_rows -> 'subject' -> 'outline' -> 'lessons') <> 4 then
    raise exception 'subject has the wrong shape' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows -> 'competencies') x where x ->> 'id' <> t || '/' || (x ->> 'key'))
     or exists (select 1 from jsonb_array_elements(p_rows -> 'sources') x where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'template_id' <> t)
     or exists (select 1 from jsonb_array_elements(p_rows -> 'nodes') x where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'template_id' <> t) then
    raise exception 'content belongs to another course' using errcode = '42501';
  end if;
  if char_length(p_rows -> 'template' ->> 'title') not between 1 and 80 or char_length(p_rows -> 'template' ->> 'module') not between 1 and 80
     or char_length(p_rows -> 'template' ->> 'subject') not between 1 and 80 then
    raise exception 'title too long' using errcode = '22023';
  end if;

  insert into public.campaign_templates (id, subject, title, module, version, owner_user_id)
    values (t, p_rows -> 'template' ->> 'subject', p_rows -> 'template' ->> 'title', p_rows -> 'template' ->> 'module', 1, p_user_id);
  insert into public.campaign_sub_skills (template_id, attribute, name)
    select t, x ->> 'attribute', left(x ->> 'name', 40) from jsonb_array_elements(p_rows -> 'subSkills') x;
  insert into public.competency_definitions (id, template_id, key, name, description, attribute)
    select x ->> 'id', t, x ->> 'key', left(x ->> 'name', 80), left(coalesce(x ->> 'description', ''), 400), x ->> 'attribute' from jsonb_array_elements(p_rows -> 'competencies') x;
  insert into public.curricula (template_id, version, subject, origin) values (t, 1, p_rows -> 'template' ->> 'subject', p_rows ->> 'origin');
  insert into public.sources select * from jsonb_populate_recordset(null::public.sources, p_rows -> 'sources');
  insert into public.curriculum_nodes select * from jsonb_populate_recordset(null::public.curriculum_nodes, p_rows -> 'nodes');
  insert into public.campaigns (user_id, template_id) values (p_user_id, t) returning id into v_campaign;
  insert into public.generated_subjects (template_id, user_id, campaign_id, description, advice_area, request, outline)
    values (t, p_user_id, v_campaign, p_rows -> 'subject' ->> 'description', p_rows -> 'subject' ->> 'advice_area', p_rows -> 'subject' -> 'request', p_rows -> 'subject' -> 'outline');
  return jsonb_build_object('campaignId', v_campaign);
end $$;

-- What the Course Builder needs to write the next lesson.
create function public.ai_course_context(p_user_id uuid, p_template_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'templateId', g.template_id,
    'campaignId', c.id,
    'campaignStatus', c.status,
    'closed', g.closed_at is not null,
    'curriculumOrigin', cu.origin,
    'subject', ct.subject,
    'title', ct.title,
    'module', ct.module,
    'description', g.description,
    'adviceArea', g.advice_area,
    'request', g.request,
    'subSkills', (select jsonb_object_agg(s.attribute, s.name) from public.campaign_sub_skills s where s.template_id = g.template_id),
    'competencies', (select jsonb_agg(jsonb_build_object('key', cd.key, 'name', cd.name, 'description', cd.description, 'attribute', cd.attribute) order by cd.id)
                     from public.competency_definitions cd where cd.template_id = g.template_id),
    'sources', (select jsonb_agg(jsonb_build_object('key', s.key, 'title', s.title, 'url', s.url, 'pageId', null) order by s.key) from public.sources s where s.template_id = g.template_id),
    'lessons', g.outline -> 'lessons',
    'completed', coalesce((select jsonb_agg(ac.activity_id) from public.activity_completions ac where ac.campaign_id = c.id), '[]'::jsonb))
  from public.generated_subjects g
  join public.campaign_templates ct on ct.id = g.template_id
  join public.curricula cu on cu.template_id = g.template_id
  left join public.campaigns c on c.id = g.campaign_id
  where g.template_id = p_template_id and g.user_id = p_user_id
$$;

-- Saves the next lesson of a subject (its Codex entries, the lesson, its check and questions).
create function public.ai_save_lesson(p_user_id uuid, p_template_id text, p_lesson_key text, p_revision_id bigint, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.generated_subjects;
  v_index integer;
  t text := p_template_id;
begin
  select * into g from public.generated_subjects where template_id = t and user_id = p_user_id and closed_at is null for update;
  if not found then raise exception 'subject not found' using errcode = '42501'; end if;
  -- Lessons are built in order, each once.
  select (i - 1)::integer into v_index from jsonb_array_elements(g.outline -> 'lessons') with ordinality as l(x, i)
    where not (x ->> 'built')::boolean order by i limit 1;
  if v_index is null or g.outline -> 'lessons' -> v_index ->> 'key' <> p_lesson_key then
    raise exception 'lesson already built or out of order' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows -> 'codex') not between 1 and 4 or jsonb_array_length(p_rows -> 'activities') <> 2
     or jsonb_array_length(p_rows -> 'items') not between 3 and 6 then
    raise exception 'lesson has the wrong shape' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows -> 'codex') x where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'template_id' <> t)
     or exists (select 1 from jsonb_array_elements(p_rows -> 'activities') x
                where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'template_id' <> t or x ->> 'objective_id' <> t || '/' || p_lesson_key || '-goal')
     or exists (select 1 from jsonb_array_elements(p_rows -> 'items') x
                where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'activity_id' <> t || '/' || p_lesson_key || '-check') then
    raise exception 'content belongs to another lesson' using errcode = '42501';
  end if;

  insert into public.codex_entries select * from jsonb_populate_recordset(null::public.codex_entries, p_rows -> 'codex');
  insert into public.learning_activities select * from jsonb_populate_recordset(null::public.learning_activities, p_rows -> 'activities');
  insert into public.assessment_items select * from jsonb_populate_recordset(null::public.assessment_items, p_rows -> 'items');
  update public.generated_subjects
     set outline = jsonb_set(jsonb_set(outline, array['lessons', v_index::text, 'built'], 'true'::jsonb),
                             array['lessons', v_index::text, 'revisionId'], coalesce(to_jsonb(p_revision_id), 'null'::jsonb))
   where template_id = t;
end $$;

-- ─────────────────────────────────────────────────────────────── Player function

-- Closes one of the player's AI-made subjects: it stops counting toward the limit and its campaign
-- is paused. Nothing is deleted; it stays readable.
create function public.close_generated_subject(p_template_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.generated_subjects set closed_at = now() where template_id = p_template_id and user_id = auth.uid() and closed_at is null;
  if not found then return false; end if;
  update public.campaigns set status = 'paused' where template_id = p_template_id and user_id = auth.uid() and status = 'active';
  return true;
end $$;

-- ─────────────────────────────────────────────────────────────── Privileges

revoke all on public.generated_subjects, public.content_reports from anon, authenticated;
grant select on public.generated_subjects, public.content_reports to authenticated;
grant insert (activity_id, message) on public.content_reports to authenticated;

revoke execute on function public.ai_subject_slots(uuid), public.ai_create_subject(uuid, integer, jsonb), public.ai_course_context(uuid, text),
  public.ai_save_lesson(uuid, text, text, bigint, jsonb), public.close_generated_subject(text) from public, anon, authenticated;
grant execute on function public.ai_subject_slots(uuid), public.ai_create_subject(uuid, integer, jsonb), public.ai_course_context(uuid, text),
  public.ai_save_lesson(uuid, text, text, bigint, jsonb) to service_role;
grant execute on function public.close_generated_subject(text) to authenticated;
