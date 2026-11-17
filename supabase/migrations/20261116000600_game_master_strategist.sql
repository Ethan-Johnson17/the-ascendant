-- Phase 4 Milestone C part 3: what the Game Master and the Strategist may see.
--
-- Both are read-only, service-role functions. Neither returns answer keys: the Strategist sees each
-- question's prompt, difficulty and kind, never its options, answer, rubric or model answer.

-- The campaign and the player's character, for narration.
create function public.ai_scene_context(p_user_id uuid, p_campaign_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignTitle', ct.title,
    'campaignDescription', coalesce(gs.description, ct.module),
    'character', (
      select jsonb_build_object('name', ch.name, 'race', r.name, 'className', cl.name)
      from public.characters ch
      join public.races r on r.id = ch.race_id
      join public.classes cl on cl.id = ch.class_id
      where ch.user_id = p_user_id))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  left join public.generated_subjects gs on gs.template_id = c.template_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- The campaign's competencies with the player's mastery stage, and its question bank (no answers).
-- Only questions whose check the player can already take (its lesson exists) are in a template.
create function public.ai_boss_context(p_user_id uuid, p_campaign_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignTitle', ct.title,
    'campaignDescription', coalesce(gs.description, ct.module),
    'competencies', coalesce((
      select jsonb_agg(jsonb_build_object('id', cd.id, 'name', cd.name, 'stage', coalesce(cp.mastery_stage, 1)) order by cd.id)
      from public.competency_definitions cd
      left join public.competency_progress cp on cp.campaign_id = c.id and cp.competency_id = cd.id
      where cd.template_id = c.template_id), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'competencyIds', to_jsonb(ce.competency_ids),
        'concept', ce.title,
        'difficulty', i.difficulty,
        'kind', i.kind,
        'prompt', i.definition ->> 'prompt') order by la.position, i.position)
      from public.assessment_items i
      join public.learning_activities la on la.id = i.activity_id
      join public.codex_entries ce on ce.id = i.concept_id
      where la.template_id = c.template_id and i.kind <> 'written'), '[]'::jsonb))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  left join public.generated_subjects gs on gs.template_id = c.template_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

revoke execute on function public.ai_scene_context(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ai_boss_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_scene_context(uuid, uuid) to service_role;
grant execute on function public.ai_boss_context(uuid, uuid) to service_role;
