-- The Ascendant — Phase 5 Part C3: free talk with characters.
--
-- Players talk with a course's characters (the Guide, and people of the time in authored courses),
-- voiced by the Game Master (AI). Story only: nothing here touches XP, mastery or any other
-- progress (GAME_DESIGN.md "Talk with characters"). Conversations are saved so they can continue,
-- keeping the last 20 messages per character; players can read and clear their own, but only the
-- `ai` Edge Function (service role) adds messages, after checking the reply.

create table public.talk_messages (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  character_id text not null check (character_id ~ '^[a-z0-9-]{1,40}$'),
  speaker text not null check (speaker in ('player', 'character')),
  body text not null check (char_length(body) between 1 and 2000),
  -- Who wrote a character's line: the AI or the labelled development fixture. Null for the player.
  origin text check ((speaker = 'player') = (origin is null) and (origin is null or origin in ('ai', 'fixture'))),
  -- Places the character suggested (the game's own ids, e.g. "next_lesson").
  suggestions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index talk_messages_conversation on public.talk_messages (campaign_id, character_id, id);
create index talk_messages_user on public.talk_messages (user_id);

alter table public.talk_messages enable row level security;
create policy "players read their own conversations" on public.talk_messages for select to authenticated using (user_id = (select auth.uid()));
create policy "players clear their own conversations" on public.talk_messages for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.talk_messages from anon, authenticated;
grant select, delete on public.talk_messages to authenticated;

-- What the Game Master needs to voice a character: the hero, the unlocked Codex entries (the only
-- facts it may state), the next lesson, and the latest messages of this conversation.
create function public.ai_talk_context(p_user_id uuid, p_campaign_id uuid, p_character_id text, p_history integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'templateId', c.template_id,
    'campaignTitle', ct.title,
    'character', (
      select jsonb_build_object('name', ch.name, 'race', r.name, 'className', cl.name)
      from public.characters ch
      join public.races r on r.id = ch.race_id
      join public.classes cl on cl.id = ch.class_id
      where ch.user_id = p_user_id),
    'known', coalesce((
      select jsonb_agg(jsonb_build_object('title', ce.title, 'summary', ce.summary) order by ce.id)
      from public.codex_entries ce
      where ce.template_id = c.template_id and exists (
        select 1 from public.activity_completions ac join public.learning_activities la on la.id = ac.activity_id
        where ac.campaign_id = c.id and ce.id = any (la.introduces_ids))), '[]'::jsonb),
    'nextLesson', (
      select jsonb_build_object('key', la.key, 'title', la.title)
      from public.learning_activities la
      join public.curriculum_nodes o on o.id = la.objective_id
      join public.curriculum_nodes tp on tp.id = o.parent_id
      where la.template_id = c.template_id and la.kind = 'lesson'
        and not exists (select 1 from public.activity_completions ac where ac.campaign_id = c.id and ac.activity_id = la.id)
      order by tp.position, o.position, la.position
      limit 1),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('speaker', m.speaker, 'text', m.body) order by m.id)
      from (select * from public.talk_messages t
            where t.campaign_id = c.id and t.character_id = p_character_id
            order by t.id desc limit greatest(0, least(p_history, 20))) m), '[]'::jsonb))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Saves one exchange ({ message, reply, origin, suggestions }: the player's message and the checked
-- reply) and keeps the last p_keep messages of the conversation.
create function public.ai_save_talk(p_user_id uuid, p_campaign_id uuid, p_character_id text, p_exchange jsonb, p_keep integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.campaigns where id = p_campaign_id and user_id = p_user_id) then
    raise exception 'campaign not found' using errcode = '42501';
  end if;
  -- One exchange at a time per conversation, so trimming never races.
  perform pg_advisory_xact_lock(hashtext('talk:' || p_campaign_id::text || ':' || p_character_id));
  insert into public.talk_messages (campaign_id, user_id, character_id, speaker, body, origin)
    values (p_campaign_id, p_user_id, p_character_id, 'player', p_exchange ->> 'message', null);
  insert into public.talk_messages (campaign_id, user_id, character_id, speaker, body, origin, suggestions)
    values (p_campaign_id, p_user_id, p_character_id, 'character', p_exchange ->> 'reply', p_exchange ->> 'origin',
            array(select jsonb_array_elements_text(coalesce(p_exchange -> 'suggestions', '[]'::jsonb))));
  delete from public.talk_messages
   where campaign_id = p_campaign_id and character_id = p_character_id
     and id not in (select id from public.talk_messages where campaign_id = p_campaign_id and character_id = p_character_id
                    order by id desc limit greatest(2, p_keep));
end $$;

revoke execute on function public.ai_talk_context(uuid, uuid, text, integer), public.ai_save_talk(uuid, uuid, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.ai_talk_context(uuid, uuid, text, integer), public.ai_save_talk(uuid, uuid, text, jsonb, integer)
  to service_role;
