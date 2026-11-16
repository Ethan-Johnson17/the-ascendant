-- The Ascendant — Phase 4 Milestone A: AI usage log, limits and Tutor context.
--
-- Every AI request is logged (role, provider, model, tokens, outcome) and counted against the
-- player's limits before the provider is called. Only the `ai` Edge Function (service role) writes
-- here; players can read their own rows. No prompts or answers are stored.

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid references public.campaigns on delete set null,
  role text not null check (role in ('game_master', 'tutor', 'examiner', 'strategist', 'researcher', 'progression_advisor')),
  status text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  origin text check (origin in ('ai', 'fixture')),
  provider text check (char_length(provider) <= 60),
  model text check (char_length(model) <= 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  error_kind text check (error_kind in ('not_configured', 'timeout', 'rate_limited', 'unavailable', 'bad_output', 'refused', 'internal')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_requests_user_time on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;
create policy "players read their own AI usage" on public.ai_requests for select to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────── Service-role functions

-- The material the Tutor may use for one lesson: its sections, the Codex entries it introduces and
-- the campaign's sources. Null if the campaign isn't the player's or the lesson isn't in it.
create function public.ai_tutor_context(p_user_id uuid, p_campaign_id uuid, p_activity_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'lesson', jsonb_build_object('id', la.id, 'title', la.title, 'sections', coalesce(la.sections, '[]'::jsonb)),
    'codex', coalesce((
      select jsonb_agg(jsonb_build_object('id', ce.id, 'title', ce.title, 'summary', ce.summary, 'explanation', to_jsonb(ce.explanation),
                                          'certainty', ce.certainty, 'citations', ce.citations) order by array_position(la.introduces_ids, ce.id))
      from public.codex_entries ce where ce.id = any (la.introduces_ids)), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'author', s.author, 'publisher', s.publisher,
                                          'publicationDate', s.publication_date, 'url', s.url, 'verified', s.verification_status = 'verified') order by s.key)
      from public.sources s where s.template_id = c.template_id), '[]'::jsonb))
  from public.campaigns c
  join public.learning_activities la on la.template_id = c.template_id and la.id = p_activity_id and la.kind = 'lesson'
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Counts the request against the player's limits and logs it as pending, atomically (a per-player
-- lock stops two simultaneous requests from both slipping under the limit). Raises AL001 when the
-- daily limit is reached and AL002 for the per-minute limit.
create function public.ai_reserve_request(p_user_id uuid, p_role text, p_campaign_id uuid, p_now timestamptz,
                                          p_daily_limit integer, p_minute_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_day integer;
  v_minute integer;
  v_oldest timestamptz;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_user_id::text, 0));
  select count(*), min(created_at) into v_day, v_oldest from public.ai_requests
    where user_id = p_user_id and created_at > p_now - interval '24 hours';
  if v_day >= p_daily_limit then
    raise exception 'daily AI limit reached; next at %', v_oldest + interval '24 hours' using errcode = 'AL001';
  end if;
  select count(*) into v_minute from public.ai_requests where user_id = p_user_id and created_at > p_now - interval '1 minute';
  if v_minute >= p_minute_limit then
    raise exception 'too many AI requests this minute' using errcode = 'AL002';
  end if;
  insert into public.ai_requests (user_id, campaign_id, role, created_at) values (p_user_id, p_campaign_id, p_role, p_now) returning id into v_id;
  return jsonb_build_object('requestId', v_id, 'usedToday', v_day + 1);
end $$;

-- Records how a reserved request ended. Only that player's pending rows can be finished, once.
create function public.ai_finish_request(p_user_id uuid, p_request_id uuid, p_status text, p_origin text, p_provider text, p_model text,
                                         p_input_tokens integer, p_output_tokens integer, p_attempts integer, p_error_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_requests
     set status = p_status, origin = p_origin, provider = p_provider, model = p_model, input_tokens = greatest(p_input_tokens, 0),
         output_tokens = greatest(p_output_tokens, 0), attempts = least(greatest(p_attempts, 0), 10), error_kind = p_error_kind, finished_at = now()
   where id = p_request_id and user_id = p_user_id and status = 'pending';
  if not found then raise exception 'AI request not pending' using errcode = 'P0002'; end if;
end $$;

-- Requests used in the last 24 hours, and when the oldest of them stops counting.
create function public.ai_usage(p_user_id uuid, p_now timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('usedToday', count(*), 'oldestAt', min(created_at))
  from public.ai_requests where user_id = p_user_id and created_at > p_now - interval '24 hours'
$$;

-- ─────────────────────────────────────────────────────────────── Privileges

revoke all on public.ai_requests from anon, authenticated;
grant select on public.ai_requests to authenticated;

revoke execute on function public.ai_tutor_context(uuid, uuid, text), public.ai_reserve_request(uuid, text, uuid, timestamptz, integer, integer),
  public.ai_finish_request(uuid, uuid, text, text, text, text, integer, integer, integer, text), public.ai_usage(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ai_tutor_context(uuid, uuid, text), public.ai_reserve_request(uuid, text, uuid, timestamptz, integer, integer),
  public.ai_finish_request(uuid, uuid, text, text, text, text, integer, integer, integer, text), public.ai_usage(uuid, timestamptz)
  to service_role;
