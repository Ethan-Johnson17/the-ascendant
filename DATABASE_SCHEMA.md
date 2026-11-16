# The Ascendant — Database Schema

Status: **Approved by the product owner 2026-11-13.** Phase 2 tables are written as migrations,
tested offline, and applied to the live Supabase project on 2026-11-14 (see "Implemented in Phase 2").
`profiles.settings` exists but is unused for now: display settings are kept per device.
The remaining tables are planned for Phases 3–5.

## Implemented in Phase 2

Migrations: `supabase/migrations/20261114000100_core_schema.sql` (tables, triggers, functions,
permissions, RLS) and `20261114000200_content_seed.sql` (content rows, which must match `src/content`
— enforced by `supabase/tests/content-sync.test.ts`).

**Content (readable by everyone, writable by no player):** `races`, `classes`, `backgrounds`,
`tinctures`, `items`, `background_starting_items`, `achievements`, `campaign_templates`
(`owner_user_id` null = authored; otherwise private to that player), `campaign_sub_skills`
(one per attribute per template), `competency_definitions` (id `<template>/<key>`, attribute must be
one of the template's sub-skills).

**Player data (each player sees only their own rows):**

| Table | Players may write | Engine/database-owned |
|---|---|---|
| `profiles` | `display_name`, `settings` | created on sign-up |
| `characters` | insert: name, race, class, background, crest, appearance, ideals, bonds, motivation; update: name, crest, appearance, ideals, bonds, motivation | `strength`…`charisma` (1–20, start 1), `total_xp`; one per player |
| `campaigns` | insert: `template_id`; update: `status` (active/paused only), `last_played_at` | `campaign_xp`, `curriculum_version`, completion; unique per template |
| `competency_progress` | — | `mastery_stage` (1–6); created for every competency when a campaign starts |
| `xp_transactions` | — | append-only ledger; unique `(user_id, idempotency_key)`; `kind` limited to the engine's XP kinds |
| `player_achievements` | — | granted by triggers |
| `character_items` | — | starting gear from background; later rewards |

**Functions:** `apply_xp_award(...)` — server role only; writes one ledger row and updates the
character/campaign totals only if the row was new; refuses another player's campaign.
`delete_my_progress()` — signed-in player; deletes only their own character, campaigns and progress.

Differences from the proposal below: attributes are six named columns rather than abbreviations;
`level` and `campaign_level` are computed by the engine from XP instead of stored; sub-skills added.

## Implemented in Phase 4 Milestone B

Migration `supabase/migrations/20261116000200_written_answers.sql` (tested offline; applied live):
- `assessment_items.kind` accepts `written` (rubric and model answer stay in the hidden `definition`).
- `learning_activities.target_stage` now 2–5; new `written_count` (how many written questions an
  attempt issues; 0 for lessons, never more than `question_count`).
- `assessment_attempts.counted` (false when the Examiner wasn't confident; such an attempt can't be
  passed) and `marking` (the Examiner's checked judgement; no prompt text).
- `learning_record_submission`: an uncounted attempt may not change mastery, weaknesses, XP,
  attributes or concept progress; Advanced (stage 5) only from a passed check with written answers
  and Examiner marking; answered written questions always need marking.
- `learning_competency_state` ignores uncounted attempts; `learning_start_context` returns `writtenCount`.
- New service-role function `ai_advisor_context` (curriculum titles for the Advisor's plan).

Content migration `20261116000300_history_pilot_curriculum_v2.sql` (generated): curriculum version 2.
Applied migrations are never edited, so each content release gets a new generated file.

## Implemented in Phase 4 Milestone A

Migration `supabase/migrations/20261116000100_ai_requests.sql` (tested offline; applied live).

**`ai_requests`**: one row per AI request: `user_id`, `campaign_id` (set null if the campaign is
deleted), `role`, `status` (pending / ok / failed), `origin` (ai / fixture), `provider`, `model`,
`input_tokens`, `output_tokens`, `attempts`, `error_kind`, `created_at`, `finished_at`. No prompts,
questions or answers are stored. Players can read their own rows; only the server writes.

**Service-role functions:** `ai_tutor_context` (a lesson's sections, the Codex entries it introduces
and the campaign's sources, only for the player's own campaign), `ai_reserve_request` (counts the
request against the rolling 24-hour and per-minute limits under a per-player lock, then logs it as
pending; errors AL001 / AL002), `ai_finish_request` (records the outcome, once), `ai_usage`.

## Implemented in Phase 3 Milestone A

Migration `supabase/migrations/20261114000300_learning_engine.sql` (tested offline; not yet applied live).

**Curriculum content (readable wherever its campaign template is visible):** `curricula` (one per
template; origin authored / generated / fixture), `curriculum_nodes` (discipline → topic → objective),
`learning_activities` (lessons with cited sections; checks with target stage and question count),
`assessment_items` (players may read only id, kind, difficulty and concept — **the `definition`
column holding the answer key is server-only**), `codex_entries`, `sources` (https only; verified or
unverified). Citations are stored inside lesson sections and Codex entries as source ids; the
curriculum validator guarantees every cited source exists. Content is written with upserts
(`src/services/curriculum/curriculumSql.ts`), never deleted, and player records reference content
without cascading, so editing a curriculum can never erase a player's evidence.

**Player learning records (read own rows only; no player writes at all):**

| Table | Holds |
|---|---|
| `assessment_attempts` | Issued questions, answers, per-question results, score, pass. Immutable once submitted (trigger). |
| `activity_completions` | Lessons completed per campaign. |
| `concept_progress` | Codex entry unlocked / last reviewed / times right and wrong. |
| `weakness_records` | One per concept per campaign: open/resolved, error category, occurrences, correct due reviews, next review, recent wrong answers. Resolved records are kept. |

Added columns: `campaigns.difficulty_preference` (−1/0/+1, player-writable);
`competency_progress.review_step`, `needs_review`, `last_difficulty`. XP kinds gain
`knowledge_check_passed`.

**Service-role functions:** `learning_start_context`, `learning_create_attempt`,
`learning_submit_context`, `learning_record_submission`, `learning_lesson_context`,
`learning_record_lesson`. Each checks that the campaign, attempt and content belong to the player.

Built on CLAUDE.md Part 5, with five structural changes explained at the end.

## Principles

1. **Content vs. player data.** Content (curricula, competency definitions, quests, bosses, sources)
   is separate from player state (progress, attempts, evidence). Authored campaigns like the History
   pilot are global read-only content; AI-generated custom campaigns are owned by the player.
2. **Ledgers, not counters.** XP is an append-only transaction ledger. `total_xp` and `level` on
   characters/campaigns are caches recomputed by the engine, never edited directly.
3. **Evidence is immutable.** Assessment attempts are never updated or deleted by gameplay, so a
   failed boss can't erase legitimate mastery records.
4. **RLS everywhere.** Every player table has `user_id` and the policy `user_id = auth.uid()`.
   Authoritative tables grant `SELECT` only to players; writes come from Edge Functions.

## Tables

### Identity
| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `user_id` PK → `auth.users`, `display_name`, `settings jsonb`, `created_at` | Created on sign-up by trigger |
| `characters` | `id`, `user_id` **unique**, `name`, `race`, `class`, `background`, `appearance jsonb`, `str/dex/con/int/wis/cha smallint`* (start at 1; derived by the engine from mastery evidence — never set by the player), `personality jsonb`, `total_xp`*, `level`*, `created_at` | One persistent character per player. *cache columns |

### Campaign content
| Table | Key columns | Notes |
|---|---|---|
| `campaign_templates` | `id`, `slug`, `subject`, `title`, `version`, `owner_user_id` (null = global) | History pilot = global template |
| `curriculum_nodes` | `id`, `template_id`, `parent_id`, `node_type` (discipline/topic/objective), `title`, `order`, `body jsonb` | One tree models Subject → Discipline → Topic → Objective |
| `competency_definitions` | `id`, `template_id`, `key`, `name`, `description`, `attribute` (enum of six), `prerequisite_ids uuid[]` | Attribute mapping lives here, per campaign |
| `activities` | `id`, `objective_id`, `activity_type` (lesson, mcq, written, scenario, project, research, simulation, retention_review), `difficulty`, `content jsonb`, `rubric jsonb`, `competency_ids uuid[]` | Every activity → ≥1 competency (check constraint) |
| `quest_definitions` | `id`, `template_id`, `quest_type`, `title`, `objectives jsonb`, `success_conditions jsonb`, `hints jsonb`, `xp_reward_kind`, `competency_ids` | |
| `boss_definitions` | `id`, `template_id`, `title`, `unlock_requirements jsonb`, `phases jsonb`, `competency_ids` | Requirements evaluated by engine |
| `sources` | `id`, `template_id`, `title`, `authors`, `publisher`, `url`, `source_type`, `published_on`, `verification_status` (unverified/verified/rejected), `verified_at`, `verified_by` | Bibliography |
| `citations` | `source_id`, `entity_type`, `entity_id`, `locator`, `claim_strength` (fact/consensus/interpretation/disputed/speculation) | Links claims to sources |

### Player progress
| Table | Key columns | Notes |
|---|---|---|
| `campaigns` | `id`, `user_id`, `template_id`, `status` (active/paused/completed), `campaign_xp`*, `campaign_level`*, `curriculum_version`, `started_at` | Player's run of a template |
| `competency_progress` | `user_id`, `campaign_id`, `competency_id`, `mastery_stage` (1–6), `evidence_count`, `retention_strength`, `next_review_at`, `last_demonstrated_at` | PK (campaign_id, competency_id) |
| `assessment_attempts` | `id`, `user_id`, `activity_id`, `competency_ids`, `response jsonb`, `evaluation jsonb`, `score`, `evaluator` (engine/ai:model), `created_at` | **Immutable evidence** |
| `xp_transactions` | `id`, `user_id`, `character_id`, `campaign_id`, `amount`, `kind`, `source_type`, `source_id`, `idempotency_key`, `config_version`, `created_at` | **Unique (user_id, idempotency_key)** blocks duplicates |
| `quest_progress` | `user_id`, `campaign_id`, `quest_id`, `status`, `state jsonb`, `completed_at` | |
| `boss_attempts` | `id`, `user_id`, `campaign_id`, `boss_id`, `encounter_state jsonb`, `outcome` (in_progress/victory/defeat/abandoned), `created_at` | Retries = new rows |
| `knowledge_entries` | `id`, `user_id`, `campaign_id`, `competency_id`, `concept_key`, `title`, `content jsonb`, `mastery_status`, `last_reviewed_at` | Codex |
| `knowledge_links` | `from_entry_id`, `to_entry_id`, `relation` | Cross-campaign relationships |
| `weakness_records` | `id`, `user_id`, `campaign_id`, `competency_id`, `concept_key`, `error_category`, `occurrence_count`, `consecutive_successes`, `review_priority`, `last_successful_at`, `next_review_at` | Leaves the bank only after N spaced successes |
| `achievements` / `player_achievements` | definitions / `user_id`, `achievement_id`, `earned_at` | Unique per player |
| `items` / `character_items` | definitions / `character_id`, `item_id`, `equipped` | Inventory |

### Operations
| Table | Notes |
|---|---|
| `ai_requests` | Implemented in Phase 4 A (see above): usage log and limit enforcement; no prompt or answer text |

## Changes from CLAUDE.md's starting schema (approved 2026-11-13)

1. **Definitions split from progress** (`competency_definitions` vs `competency_progress`, etc.).
   The original put `mastery_level` on the competency itself, which would force a copy of every
   competency per player and makes authored content hard to update.
2. **Templates vs. campaigns**, so the History pilot is authored once and played by everyone.
3. **Curriculum as one tree table** instead of separate discipline/topic/objective tables — handles
   any subject depth without schema changes.
4. **Idempotency key + unique constraint** on XP transactions — the database itself refuses duplicates.
5. **Immutable assessment attempts** as the evidence base for mastery decisions.
