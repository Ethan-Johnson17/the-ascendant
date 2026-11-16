# Development Log

## 2026-11-16 — Phase 4 Milestone B: the Examiner and the Progression Advisor

**Product owner decisions:** written questions both inside existing checks and in new Advanced
checks; if the Examiner is unsure, the whole attempt doesn't count; the Advisor's plan is always
shown and the AI explains it on request. Recorded in GAME_DESIGN.md "AI rules".

**Built:**
- engine: `written` questions with rubrics, "confident" attempts, Advanced cap for written work,
  `planAttempt` without the Examiner, `nextSteps.ts`;
- server: `roles/examiner.ts`, `roles/advisor.ts`, `examinerService.ts`, `usageLog.ts` (shared by all
  roles), the `advise` action;
- database: migration `20261116000200_written_answers.sql`, content v2;
- screens: written answers and rubric feedback on the check screen, "Next steps" on the dashboard.

**Choices:**
- *Quotes as evidence.* Every criterion the Examiner says is met must quote the player's answer, and
  the quote is checked. This stops the AI crediting things the player never wrote.
- *The Examiner runs inside the `learning` function*, not the `ai` one, so marking and recording happen
  in one request and a browser can't submit a mark of its own.
- *If marking fails, nothing is recorded*, so a provider outage never costs the player an attempt.
- *Content releases get a new migration file.* The generator used to rewrite the Phase 3 file, which
  Supabase won't re-apply once applied.
- *The Advisor never sees free text*: the browser sends step kinds and ids; titles come from the database.

**Problems hit:** the Examiner fixture re-validated questions with the authoring schema, which rejects
database ids; it now trusts the server's already-validated question. A test word ("fertile") also
appeared inside "infertile" in a choice option; the test now uses a rubric-only phrase.

**Live test:** see TESTING.md. One finding: a cheating attempt in the answer box was marked 0 of 4
with *high* confidence, rather than the "low" the prompt asks for. The result is still safe (no
points), but it counted as a wrong answer and added a Weakness Bank review on the test account.

**Open:** take an Advanced check live once a competency is Proficient; see how often real answers
get "didn't count"; log repair reasons (field names only).

## 2026-11-16 — Phase 4 Milestone A: AI foundation and the Tutor

**Product owner decisions:** Groq free tier; Tutor first; written answers count only when the
Examiner is confident; 30 AI requests per player per day. Recorded in GAME_DESIGN.md "AI rules".

**Research (2026-11-15):** Groq's own rate-limit page lists `openai/gpt-oss-120b` on the free plan at
30 requests/minute, 1,000/day, 8,000 tokens/minute and 200,000 tokens/day, organisation-wide. Its
data page says inference inputs and outputs are not retained by default. Third-party reports put
Gemini's free tier as low as 20 requests/day for its main model, and OpenRouter's free models at
50/day. No local GPU or Ollama on this machine, so local models were ruled out for now.

**Built:** `src/services/ai/` (provider types, OpenAI-compatible adapter, fixture provider, structured
replies with one repair attempt, `providerFromEnv`, Tutor role, `aiService.ts`, browser `aiClient.ts`);
migration `20261116000100_ai_requests.sql`; the `ai` Edge Function; `TutorPanel` on the lesson screen.

**Choices:**
- *Source labels instead of ids.* The model sees only verified sources, as S1, S2... Labels are
  mapped back after the reply; anything else is removed and the paragraph is flagged unsupported.
- *Simplified schema for providers.* Length and count limits are removed from the JSON Schema sent
  to the provider (some strict modes reject them) and enforced by our own zod check instead.
- *Limits are reserved before the call*, under a per-player database lock, so two quick clicks can't
  both slip under the limit. Failed requests still count, so retries can't be used to hammer the AI.
- *No AI configured means "not set up"*, never a silent fixture. Fixtures run only when
  `AI_PROVIDER=fixture` is set, and every fixture answer says so.
- *No prompts or answers are stored*: the log keeps role, provider, model, tokens and outcome.
- The test helper that calls server SQL functions moved to `supabase/tests/testDb.ts` for reuse.

**Problems hit:** a scripted multi-file edit was blocked by a safety check that misread the script,
and another failed on shell quoting; the same edits were made with the editor and a script file.

**Live test (after the key was added):** the secret was first saved under the name `Groq`, which the
function doesn't read; renamed to `AI_API_KEY`. The function now builds its provider on every request,
so secret changes apply without a redeploy. Four live questions behaved correctly (see TESTING.md).
Two of the four needed a repair attempt; the cause isn't visible because no text is logged.

**Open:** log the failing field names when a repair happens; Milestones B and C.

## 2026-11-14 — Phase 3 Milestone B: Mesopotamia lessons and learning screens

**Built:** authored curriculum `src/content/curricula/historyEarlyCivilizations.ts` (server-side
only; holds answer keys) and its generated migration; campaign, lesson, check, Codex and Weakness
Bank screens; `learningData.ts` (reads the player's view of a campaign) and `learningClient.ts`
(calls the Edge Function, validates its replies).

**Sources:** six, each opened and read on 2026-11-14 (Met Museum essays, Britannica, Jacobsen &
Adams 1958, Powell 1985). Automated fetchers were blocked by these sites, so pages were read in the
in-app browser and journal metadata confirmed through Crossref. Any detail not found in a source was
cut (for example a flood calendar and an Uruk population figure).

**Choices:**
- *Content as code, published as a migration.* Lessons are typed and validated in TypeScript, then
  `npm run content:sql` writes the SQL. A test fails if the migration is out of date, and another
  fails if any app screen imports the curriculum file (which would ship answer keys to browsers).
  The production bundle was searched to confirm.
- *Locked Codex entries are searchable by title only*, so search doesn't reveal lesson content early.
- *Phone tab bar:* six tabs (Home, Hero, Learn, Codex, Review, Settings). Inventory is reached from
  the character sheet on phones; the desktop sidebar lists everything.

**Confirmed:** Supabase's API deploy bundles the shared `src/` engine files the function imports,
so no copy in `supabase/functions/_shared` is needed.

**Live walkthrough:** see TESTING.md. One lesson and two checks were taken on the product owner's
development account (one deliberate mistake, to exercise the Weakness Bank).

**Open:** product-owner review of the lesson text; unit tests for `buildCampaignLearning`; custom
email (SMTP) before beta.

## 2026-11-14 — Phase 3 Milestone A: the learning engine

**Product owner decisions:** mastery needs two passes on different days (capped at Proficient until
applied evidence exists); a weakness clears after three correct due reviews; XP for first completion
only, plus scheduled reviews; starter lessons written by the team with verified sources. Recorded in
`GAME_DESIGN.md` §5.

**Built:** `src/engine/learning/` (config, curriculum format and validator, marking, mastery,
retention, Weakness Bank, difficulty, and `session.ts` which decides a whole check); the learning
migration; `learningService.ts` (load context → engine decides → database records); the `learning`
Edge Function; curriculum-to-SQL writer; curriculum generator interface with a labelled fixture.

**Architecture choices:**
- *Checks are issued by the server.* Starting a check records exactly which questions were given, so
  a player can't pick easy questions or see answer keys; marking happens only on the server.
- *One service, two runtimes.* The same `learningService.ts` runs in the Edge Function (Deno) and in
  the offline tests (Node + PGlite). It talks to the database only through six service-role SQL
  functions, so the test adapter and the Supabase adapter are each a few lines.
- *Defence in depth.* The engine decides; the recording function still refuses stage jumps, XP for
  failed checks, XP kinds a check can't earn, and re-submission. Submitted attempts can't be edited
  even by server code.
- *Evidence outlives content edits.* Curricula are upserted, never deleted, and player records don't
  cascade from content.
- *"Two different days" = at least 20 hours apart* (configurable), since the server can't know each
  player's midnight.
- *New XP kind `knowledge_check_passed` (15 XP)* for a first pass, so reading a lesson and proving
  knowledge are rewarded separately.

**Problems hit:** shell quoting broke a few scripted edits; edits now go through the editor or
script files. A guard test flagged a variable named `window`; renamed.

**Open:** apply the migration and deploy the Edge Function (Milestone B); confirm Supabase bundles
the shared `src/` files the function imports (fallback: copy them into `supabase/functions/_shared`
with a sync test).

## 2026-11-14 — Phase 2 Milestone B: accounts and the online app

**Built:** Supabase project connected and migrations applied; sign-up, sign-in, forgot/reset password
and sign-out screens; `AuthProvider`; `GameRepository` (Supabase) replacing browser storage; row
validation (`playerData.ts`); inventory screen; achievements on the character sheet; download from the
account; delete via `delete_my_progress`; one-time import of a pre-accounts browser character.

**Choices:**
- *Publishable key name.* Supabase renamed the "anon" key to "publishable"; the config accepts either
  and refuses a key starting `sb_secret_`.
- *Engine first, database second, then reload.* Gives instant, specific messages and guarantees the
  screen shows stored truth (triggers add gear and achievements the client never computes).
- *Display settings per device* (localStorage), since motion preference can differ by device.
  `profiles.settings` is left unused for now.
- *No passwords typed by the AI assistant.* The product owner created the account; testing then used
  the real signed-in session.
- *Bundle split:* Supabase, React and Framer Motion each get a cacheable file.

**Problems hit:** Supabase CLI 3 targets a local database unless `--remote` is given; its arrow-key
prompt didn't respond in the desktop app's terminal panel, so `--yes` was used. Supabase's
"safe update" rule rejects updates without a filter, so the live security check was repeated with a
filter to prove the column permissions themselves refuse the change.

**Open:** custom SMTP before beta; account deletion; password-reset round trip test.

## 2026-11-14 — Phase 2 Milestone A: database, rules and tests

**Product owner decisions:** schema approved for build; each attribute maps to one sub-skill of the
subject; accounts use Supabase Auth (email + password; Google later) — chosen over Auth0 because it
plugs straight into the database's per-user security rules. All recorded in `GAME_DESIGN.md`.

**Built:** two migrations (`supabase/migrations/`) — core schema with RLS, triggers and functions,
then the content seed. Engine modules for attribute growth and XP award planning. History pilot
sub-skills and competencies in `src/content`. Offline database test harness.

**Architecture choices:**
- *The database enforces Phase 2 rules itself.* Players get column-level permissions: they may
  create a character (name, race, class, background, crest, story) and rename it, start/pause/resume
  campaigns — nothing else. Attributes, XP, mastery and completion can't be written by players at
  all. Triggers grant starting gear, achievements and Novice progress. This keeps Phase 2 free of
  server functions; they arrive in Phase 3 with the first real XP sources.
- *XP awards are a server-only function* (`apply_xp_award`, service role only). The unique
  `(user_id, idempotency_key)` constraint makes duplicates impossible even under retries; character
  and campaign totals update only when a new row is actually written.
- *Revoke first, then grant narrowly.* Supabase gives the API roles broad default privileges, so the
  migration revokes everything and grants back only what is listed.
- *Campaign guard runs as the caller* (security invoker), so the template lookup goes through RLS and
  a player cannot start someone else's private campaign.
- *PGlite for offline database tests* — real Postgres in WebAssembly, one dev dependency, no Docker.

**Bug caught by design review before testing:** the campaign guard was first written as security
definer, which would have made the "is this a player?" check see the function owner instead of the
player. Changed to security invoker.

**Next:** Milestone B needs the Supabase Project URL and publishable key from the product owner.

## 2026-11-14 — Decisions confirmed

- Race attribute bonuses stay dropped (may be revisited later).
- Artwork: free-licence art first, AI-generated stills as backup; every asset's licence recorded
  (`GAME_DESIGN.md` §14).
- CLAUDE.md Part 18 rewritten to the `MASTER_PROMPT.md` phase order, with the approval recorded there.

## 2026-11-13 — Phase 1: application foundation and visual identity

**Product owner decisions:** schema approved; attributes start at 1 and grow only from demonstrated
knowledge; race/class/background table approved. Race attribute bonuses were dropped because they
conflict with start-at-1 (flagged for confirmation). All recorded in `GAME_DESIGN.md` §3.

**Built:** app shell and navigation, welcome, 7-step character creation, dashboard, character sheet,
campaign selection, settings, reusable components, error screen. See ROADMAP Phase 1.

**Architecture choices:**
- *Local save until Phase 2.* Character creation and campaign actions had to do something real, and
  accounts are Phase 2. Rather than mock them, the app saves to the browser through a `SaveStore`
  interface (`src/services/save/`). Phase 2 swaps in Supabase behind the same interface.
- *Content separated from engine.* Races/classes/backgrounds and the campaign catalogue live in
  `src/content/`; the engine takes the list of valid ids as input, so new options need no engine change.
- *React context, no state library.* One `GameProvider` holds the save; all rules run in the engine.
- *Sample adventurer* in `src/fixtures/` so the design can be judged with progress on screen;
  memory-only, labelled, never written to storage.
- *Per-page code-splitting* with `React.lazy`, which fixed the Phase 0 bundle-size warning.
- *Placeholder art:* heraldic crests (tincture + class emblem) until an art source is chosen.

**Open:** art source; confirm dropping race attribute bonuses; attribute growth formula (Phase 2–3);
beta AI provider (Phase 4); CLAUDE.md Part 18 still shows the old phase order.

## 2026-11-13 — Phase 0 verified on a real machine; Phase 0 complete

**Environment:** Windows 11, nvm-windows with Node 12/14/18/24 installed; system default was 18.17.
The project needs Node ≥ 22.12 (Vite 7), so all commands ran on Node 24.21 without changing the
system default.

**Results:** install, 15/15 tests, typecheck, build and dev server all pass. Details in `TESTING.md`.

**Problems found and fixed:**
- *Node version not enforced.* On Node 18 the tools fail with unclear errors. Added `.npmrc`
  (`engine-strict=true`), `.nvmrc` (24) and tightened `engines` to `>=22.12` (Vite 7's real minimum).
- *High-severity advisory in zod 3* (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized input).
  Upgraded to zod 4.6.7 and moved `env.ts` to the zod 4 API (`z.url()`; now also requires http/https).
  All tests still pass.
- *npm 11 install-script gate.* npm now asks before running package install scripts. Approved
  `esbuild` (needed by Vite/tsx); recorded in `package.json → allowScripts`.

**Not problems:** typecheck was clean first time; Rollup "comment annotation" warnings come from
inside zod's published files and are harmless; the 660 KB bundle warning will be addressed by
route-level code-splitting in Phase 1.

**Decisions confirmed by the product owner:** phase order follows `MASTER_PROMPT.md`; code lives at
github.com/Ethan-Johnson17/the-ascendant.

**Still open:** schema approval, attribute allocation, race/class/background effects, beta AI provider.

## 2026-11-12 — Phase 0

**Inspected:** No existing repository or code. Design docs (Game Design Document v1.0, CLAUDE.md,
Master Execution Prompt) live in the Claude project.

**Environment constraint:** The build sandbox could not download npm packages. Consequently:
dependency versions in `package.json` are chosen from known releases but have not been installed;
tests ran with Node's built-in runner; UI was compile-checked with esbuild rather than run in Vite.
First real verification happens on the product owner's machine (`npm install && npm test && npm run dev`).

**Decisions made:**
- Engine lives in `src/engine/` as pure TS so Edge Functions can run it authoritatively.
- Node's built-in test runner (via `tsx`) instead of Vitest — one fewer dependency; revisit if UI
  component tests need jsdom.
- Tailwind v4 CSS-first configuration; design tokens in `src/styles/index.css`.
- Level curve `round(base × (level−1)^exponent)`; defaults are tunable placeholders (character: base 100,
  exponent 1.6, max 20 → ~11,100 XP for level 20).
- Following the Master Prompt's phase order where it differs from CLAUDE.md (see ROADMAP).

**Open:** where the code lives (GitHub vs. local folder); AI provider for beta; schema approval;
attribute allocation rules.
