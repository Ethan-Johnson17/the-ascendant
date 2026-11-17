-- The Ascendant — Phase 5 Part C1: "Go deeper" for AI-made courses.
--
-- Each AI-made lesson starts with one check (Apprentice or Competent). Going deeper adds the next
-- harder check for that lesson, one stage at a time up to Advanced (written answers only), written
-- from the lesson's own text by the Course Builder. A check is written only when the player's skill
-- is ready to take it. Only the `ai` Edge Function (service role) writes course content; these
-- functions check the order, the ids and the shape again so nothing can skip a stage.

-- What the Course Builder needs to write a harder check for one built lesson (null if there is none).
create function public.ai_deepen_context(p_user_id uuid, p_template_id text, p_lesson_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignId', c.id,
    'campaignStatus', c.status,
    'closed', g.closed_at is not null,
    'lessonTitle', l.title,
    'sections', l.sections,
    'codex', coalesce((select jsonb_agg(jsonb_build_object('key', ce.key, 'title', ce.title) order by array_position(l.introduces_ids, ce.id))
                       from public.codex_entries ce where ce.id = any (l.introduces_ids)), '[]'::jsonb),
    'checkStages', coalesce((select jsonb_agg(a.target_stage order by a.target_stage) from public.learning_activities a
                             where a.objective_id = l.objective_id and a.kind = 'assessment'), '[]'::jsonb),
    'nextPosition', (select coalesce(max(a.position), 0) + 1 from public.learning_activities a where a.objective_id = l.objective_id),
    'competencyId', l.competency_ids[1],
    'competencyName', cd.name,
    'skillStage', coalesce((select cp.mastery_stage from public.competency_progress cp
                            where cp.campaign_id = c.id and cp.competency_id = l.competency_ids[1]), 1))
  from public.generated_subjects g
  join public.learning_activities l on l.id = g.template_id || '/' || p_lesson_key and l.kind = 'lesson'
  join public.competency_definitions cd on cd.id = l.competency_ids[1]
  left join public.campaigns c on c.id = g.campaign_id
  where g.template_id = p_template_id and g.user_id = p_user_id
$$;

-- Saves one harder check for a built lesson: the next stage only, and only when the player can take it.
create function public.ai_save_deeper_check(p_user_id uuid, p_template_id text, p_lesson_key text, p_stage smallint, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t text := p_template_id;
  g public.generated_subjects;
  l public.learning_activities;
  a jsonb := p_rows -> 'activity';
  v_key text := p_lesson_key || '-check-' || p_stage;
  v_max smallint;
  v_skill smallint;
begin
  select * into g from public.generated_subjects where template_id = t and user_id = p_user_id and closed_at is null for update;
  if not found then raise exception 'subject not found' using errcode = '42501'; end if;
  select * into l from public.learning_activities where id = t || '/' || p_lesson_key and kind = 'lesson';
  if not found then raise exception 'lesson not built' using errcode = '22023'; end if;

  -- One stage at a time, up to Advanced, and only when the player's skill is ready for it.
  select max(target_stage) into v_max from public.learning_activities where objective_id = l.objective_id and kind = 'assessment';
  if v_max is null or p_stage <> v_max + 1 or p_stage > 5 then raise exception 'check out of order' using errcode = '22023'; end if;
  select coalesce((select cp.mastery_stage from public.competency_progress cp join public.campaigns c on c.id = cp.campaign_id
                   where c.id = g.campaign_id and c.status = 'active' and cp.competency_id = l.competency_ids[1]), 1) into v_skill;
  if not exists (select 1 from public.campaigns where id = g.campaign_id and status = 'active') or v_skill < p_stage - 1 then
    raise exception 'skill not ready for this check' using errcode = '42501';
  end if;

  -- The rows must be this lesson's next check, and nothing else.
  if jsonb_typeof(a) <> 'object' or jsonb_array_length(p_rows -> 'items') not between 2 and 6 then
    raise exception 'check has the wrong shape' using errcode = '22023';
  end if;
  if a ->> 'id' <> t || '/' || v_key or a ->> 'key' <> v_key or a ->> 'template_id' <> t or a ->> 'objective_id' <> l.objective_id
     or a ->> 'kind' <> 'assessment' or (a ->> 'target_stage')::smallint <> p_stage
     or a -> 'competency_ids' <> to_jsonb(l.competency_ids) then
    raise exception 'content belongs to another lesson' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows -> 'items') x
             where x ->> 'id' <> t || '/' || (x ->> 'key') or x ->> 'activity_id' <> t || '/' || v_key
                or left(x ->> 'key', char_length(p_lesson_key || '-s' || p_stage || '-')) <> p_lesson_key || '-s' || p_stage || '-'
                or not (x ->> 'concept_id' = any (l.introduces_ids))) then
    raise exception 'content belongs to another lesson' using errcode = '42501';
  end if;
  -- Advanced is earned with applied work only (GAME_DESIGN.md).
  if p_stage = 5 and exists (select 1 from jsonb_array_elements(p_rows -> 'items') x where x ->> 'kind' <> 'written') then
    raise exception 'an Advanced check is written answers only' using errcode = '22023';
  end if;

  insert into public.learning_activities select * from jsonb_populate_record(null::public.learning_activities, a);
  insert into public.assessment_items select * from jsonb_populate_recordset(null::public.assessment_items, p_rows -> 'items');
end $$;

revoke execute on function public.ai_deepen_context(uuid, text, text), public.ai_save_deeper_check(uuid, text, text, smallint, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_deepen_context(uuid, text, text), public.ai_save_deeper_check(uuid, text, text, smallint, jsonb) to service_role;
