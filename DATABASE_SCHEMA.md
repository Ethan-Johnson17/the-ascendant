# The Ascendant — Database Schema (proposed)

Status: **Approved by the product owner 2026-11-13; implemented as migrations in Phase 2–5.** Nothing below exists in a database yet.

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
| `ai_requests` | `user_id`, `role`, `provider`, `model`, `input_tokens`, `output_tokens`, `latency_ms`, `status`, `created_at` — usage log and budget enforcement |

## Changes from CLAUDE.md's starting schema (approved 2026-11-13)

1. **Definitions split from progress** (`competency_definitions` vs `competency_progress`, etc.).
   The original put `mastery_level` on the competency itself, which would force a copy of every
   competency per player and makes authored content hard to update.
2. **Templates vs. campaigns**, so the History pilot is authored once and played by everyone.
3. **Curriculum as one tree table** instead of separate discipline/topic/objective tables — handles
   any subject depth without schema changes.
4. **Idempotency key + unique constraint** on XP transactions — the database itself refuses duplicates.
5. **Immutable assessment attempts** as the evidence base for mastery decisions.
