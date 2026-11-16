-- The Ascendant — Phase 4 Milestone C, part 1: the Researcher, checked sources, repair reasons.
--
-- The Researcher (AI) suggests further reading for a Codex concept; the server checks each
-- suggestion against the live page or a library catalogue and records the result here. Only
-- verified rows are shown, and never as lesson citations. Players read their own rows; only the
-- `ai` Edge Function (service role) writes.

-- ─────────────────────────────────────────────────────────────── Repair reasons

-- Why a reply needed its one repair attempt: field paths and check codes only (for example
-- "paragraphs.0.text: too_big"), never any text from the reply.
alter table public.ai_requests add column repair_reason text check (char_length(repair_reason) <= 300);

drop function public.ai_finish_request(uuid, uuid, text, text, text, text, integer, integer, integer, text);
create function public.ai_finish_request(p_user_id uuid, p_request_id uuid, p_status text, p_origin text, p_provider text, p_model text,
                                         p_input_tokens integer, p_output_tokens integer, p_attempts integer, p_error_kind text,
                                         p_repair_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_requests
     set status = p_status, origin = p_origin, provider = p_provider, model = p_model, input_tokens = greatest(p_input_tokens, 0),
         output_tokens = greatest(p_output_tokens, 0), attempts = least(greatest(p_attempts, 0), 10), error_kind = p_error_kind,
         repair_reason = left(p_repair_reason, 300), finished_at = now()
   where id = p_request_id and user_id = p_user_id and status = 'pending';
  if not found then raise exception 'AI request not pending' using errcode = 'P0002'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────── Further reading

create table public.research_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  concept_id text not null references public.codex_entries on delete cascade,
  kind text not null check (kind in ('web', 'book', 'article')),
  title text not null check (char_length(title) between 1 and 300),
  author text check (char_length(author) <= 300),
  publisher text check (char_length(publisher) <= 200),
  year smallint check (year between 0 and 2100),
  url text check (url is null or (char_length(url) <= 600 and url like 'https://%')),
  doi text check (char_length(doi) <= 150),
  why text check (char_length(why) <= 300),
  status text not null check (status in ('verified', 'unverified')),
  publisher_kind text check (publisher_kind in ('museum', 'university', 'government', 'library', 'academic_publisher', 'encyclopedia')),
  -- Each automated check: name, passed, detail.
  checks jsonb not null check (jsonb_typeof(checks) = 'array'),
  origin text not null check (origin in ('ai', 'fixture')),
  created_at timestamptz not null default now()
);
create index research_results_lookup on public.research_results (campaign_id, concept_id, created_at desc);
create index research_results_user on public.research_results (user_id);

-- One row per search, so the cooldown works even when nothing was suggested.
create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  concept_id text not null references public.codex_entries on delete cascade,
  origin text not null check (origin in ('ai', 'fixture')),
  suggested smallint not null check (suggested between 0 and 6),
  verified smallint not null check (verified between 0 and suggested),
  created_at timestamptz not null default now()
);
create index research_runs_lookup on public.research_runs (campaign_id, concept_id, created_at desc);
create index research_runs_user on public.research_runs (user_id);

alter table public.research_runs enable row level security;
create policy "players read their own research runs" on public.research_runs for select to authenticated using (user_id = (select auth.uid()));

alter table public.research_results enable row level security;
create policy "players read their own further reading" on public.research_results for select to authenticated using (user_id = (select auth.uid()));

-- What the Researcher may know about a concept: titles and summaries from the curriculum only.
create function public.ai_research_context(p_user_id uuid, p_campaign_id uuid, p_concept_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaignStatus', c.status,
    'subject', ct.subject,
    'campaignTitle', ct.title,
    'concept', jsonb_build_object('id', ce.id, 'title', ce.title, 'summary', ce.summary),
    'knownSources', coalesce((select jsonb_agg(jsonb_build_object('title', s.title, 'url', s.url) order by s.key)
                              from public.sources s where s.template_id = c.template_id), '[]'::jsonb),
    'lastResearchAt', (select max(r.created_at) from public.research_runs r where r.campaign_id = c.id and r.concept_id = ce.id))
  from public.campaigns c
  join public.campaign_templates ct on ct.id = c.template_id
  join public.codex_entries ce on ce.template_id = c.template_id and ce.id = p_concept_id
  where c.id = p_campaign_id and c.user_id = p_user_id
$$;

-- Replaces the player's further reading for one concept with freshly checked results.
create function public.ai_record_research(p_user_id uuid, p_campaign_id uuid, p_concept_id text, p_origin text, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if not exists (select 1 from public.campaigns c join public.codex_entries ce on ce.template_id = c.template_id and ce.id = p_concept_id
                 where c.id = p_campaign_id and c.user_id = p_user_id) then
    raise exception 'concept not in this campaign' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 6 then
    raise exception 'too many results' using errcode = '22023';
  end if;
  delete from public.research_results where campaign_id = p_campaign_id and concept_id = p_concept_id and user_id = p_user_id;
  for r in select * from jsonb_array_elements(p_results) loop
    -- "Verified" needs every recorded check to have passed.
    if r ->> 'status' = 'verified' and (jsonb_array_length(r -> 'checks') = 0
       or exists (select 1 from jsonb_array_elements(r -> 'checks') k where not (k ->> 'passed')::boolean)) then
      raise exception 'a source cannot be verified with failed checks' using errcode = '22023';
    end if;
    insert into public.research_results (user_id, campaign_id, concept_id, kind, title, author, publisher, year, url, doi, why, status, publisher_kind, checks, origin)
      values (p_user_id, p_campaign_id, p_concept_id, r ->> 'kind', r ->> 'title', r ->> 'author', r ->> 'publisher', (r ->> 'year')::smallint,
              r ->> 'url', r ->> 'doi', r ->> 'why', r ->> 'status', r ->> 'publisherKind', r -> 'checks', p_origin);
  end loop;
  insert into public.research_runs (user_id, campaign_id, concept_id, origin, suggested, verified)
    values (p_user_id, p_campaign_id, p_concept_id, p_origin, jsonb_array_length(p_results),
            (select count(*) from jsonb_array_elements(p_results) x where x ->> 'status' = 'verified'));
end $$;

-- ─────────────────────────────────────────────────────────────── Privileges

revoke all on public.research_results, public.research_runs from anon, authenticated;
grant select on public.research_results, public.research_runs to authenticated;

revoke execute on function public.ai_finish_request(uuid, uuid, text, text, text, text, integer, integer, integer, text, text),
  public.ai_research_context(uuid, uuid, text), public.ai_record_research(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_finish_request(uuid, uuid, text, text, text, text, integer, integer, integer, text, text),
  public.ai_research_context(uuid, uuid, text), public.ai_record_research(uuid, uuid, text, text, jsonb)
  to service_role;
