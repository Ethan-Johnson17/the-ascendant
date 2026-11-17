# The Ascendant — Architecture

Status: **Phase 1 (2026-11-13).** This describes the target architecture and marks what exists today.
`GAME_DESIGN.md` is the product authority; this document explains how the code delivers it.

---

## 1. The one rule everything else serves

> **The AI proposes. The engine decides. The database records.**

| Layer | Owns | Never does |
|---|---|---|
| **AI orchestration** (server) | Narrative, lessons, questions, rubric-based evaluations, scenario drafts | Award XP, change mastery, declare a boss defeated, write to player tables |
| **Game engine** (pure TypeScript) | XP, levels, attributes, mastery rules, unlocks, boss eligibility, combat resolution, rewards | Call an AI provider, touch the network, read the clock implicitly |
| **Database** (Supabase Postgres) | Durable state, the XP ledger, evidence, row-level security | Accept authoritative writes straight from the browser |

An AI evaluation is just *evidence*. It is schema-validated, stored, and then fed to the engine,
which applies deterministic rules to decide what (if anything) changes.

## 2. System overview

```
 Browser (React SPA, later wrapped by Capacitor for iOS)
 ├─ UI: pages, layouts, components (Tailwind tokens + Framer Motion)
 ├─ Feature modules: hooks + view models per domain
 ├─ Game engine (same code as server) — used ONLY for previews ("you'd reach level 4")
 └─ Supabase client (anon key) ──► reads own rows via RLS
                                └─► calls Edge Functions for every state-changing action
                                          │
 Supabase                                 ▼
 ├─ Edge Functions (Deno)  ── "game actions" API
 │    1. authenticate the player (JWT)
 │    2. load state from Postgres
 │    3. (optionally) ask AI orchestration for content / an evaluation
 │    4. validate AI output against a schema
 │    5. run the game engine → a list of state changes
 │    6. commit changes in one transaction (idempotency key enforced by a unique constraint)
 ├─ Postgres  — content tables (read-only to players) + player tables (RLS: owner only)
 ├─ Auth      — email magic link / password; OAuth later
 └─ Storage   — character art, battle illustrations, media
                                          │
 AI providers (swappable) ◄───────────────┘  fixtures · local Ollama · hosted APIs
```

**Why the engine runs server-side for real awards:** anything computed only in the browser can be
edited by the player. Running the same engine code inside Edge Functions makes XP, mastery and boss
outcomes authoritative while letting the browser show instant previews from identical rules.

## 3. Source layout

```
src/
  app/          App root, router, GameProvider (app state), ErrorBoundary  ← exists
  pages/        One lazily loaded component per screen  ← exists
  layouts/      AppShell (sidebar / bottom nav), FocusLayout (onboarding)  ← exists
  components/   ui/ primitives (Button, Panel, ProgressBar, OptionCard, ConfirmDialog …) and
                game/ pieces (Crest, AttributeTile)  ← exists
  features/     Domain UI modules: character, campaigns, learning, quests, combat, codex,
                weaknesses, inventory, settings. Each holds hooks + components for its domain.
  engine/       ★ Deterministic game engine. Pure TS, zero dependencies on React, Supabase,
                Node or Deno. Imported by both the browser and Edge Functions.
    progression/  XP config, level curves  ← exists (Phase 0)
    character/    attributes (start at 1), character creation rules  ← exists
    campaigns/    campaign lifecycle: start, pause, resume, current  ← exists
    character/attributeGrowth.ts  attribute scores derived from competency mastery  ← exists
    progression/xpAward.ts        XP award planning + idempotency keys  ← exists
    competency/   mastery stages, evidence rules (Phase 3)
    retention/    spaced-repetition scheduling (Phase 3)
    quests/       objective + success-condition evaluation (Phase 5)
    combat/       boss eligibility, encounter state machine, resolution (Phase 5)
  content/      Authored content as data: character options, campaign catalogue  ← exists;
                full History pilot curriculum (Phase 6)
  fixtures/     Clearly labelled development data (sample adventurer)  ← exists
  services/     Supabase client; save/ = validated local save behind a SaveStore interface  ← exists
  config/       Environment parsing and validation  ← exists
  types/        Shared types / schemas (zod) used on both sides of the wire
  hooks/        Generic hooks (media queries, reduced motion …)
  styles/       Design tokens (index.css) and motion tokens  ← exists
supabase/
  migrations/   Versioned SQL migrations: core schema + RLS, content seed  ← exists (Phase 2)
  tests/        Offline database tests: PGlite + test-only Supabase stand-in  ← exists
  functions/    Edge Functions: XP awards + game actions (Phase 3), AI orchestration (Phase 4)
```

**Phase 2 sequencing.** Until Edge Functions exist, the database enforces the rules directly:
column-level grants decide which fields a player may write, triggers grant starting gear,
achievements and Novice competency progress, and RLS isolates each player's rows. The only way to
add XP is `apply_xp_award`, callable by the server role alone; Phase 3's Edge Functions will call it
after the engine has decided the award (`engine/progression/xpAward.ts`).

Deviation from CLAUDE.md's suggested tree: CLAUDE.md lists `progression/`, `combat/` etc. under
`features/`. I split each into **`engine/<domain>`** (rules, no UI) and **`features/<domain>`** (UI).
This is what makes the engine "independently testable without rendering the interface" and
importable by server code. No product requirement changes.

## 4. Data flow — example: answering an assessment

*Built in Phase 3 Milestone A for self-marked questions; written answers and the Examiner added in Phase 4 Milestone B.*

0. Starting a check: browser calls `POST /functions/v1/learning` `{ action: 'start_check', campaignId, activityId }`.
   The engine picks the questions (difficulty from recent accuracy, weaknesses and the player's
   preference) and the attempt is recorded with exactly those questions — answer keys stay on the server.
1. Player submits answers in the Learning interface.
2. Browser calls `POST /functions/v1/learning` with `{ action: 'submit_check', attemptId, answers }`.
3. Function (`supabase/functions/learning` → `src/services/learning/learningService.ts`) loads the
   attempt, the issued questions with their answer keys, and the player's competency state via
   service-role SQL functions (`learning_submit_context`).
4. Multiple-choice → graded deterministically by the engine. Written answer → **Examiner** role
   (`src/services/ai/examinerService.ts`) says which rubric criteria are met, quoting the answer, and
   how confident it is; the server checks the judgement, then the engine adds up the points. If any
   written answer isn't confidently marked, the whole attempt is recorded as "didn't count".
5. Evaluation is validated with zod. Invalid → retry once, then fail safely ("evaluation unavailable,
   your answer is saved") — never a guessed grade.
6. Engine computes: XP award (or none if already awarded), evidence record, mastery change if the
   evidence rules are met, Weakness Bank update, next review date.
7. All changes commit in one transaction (`learning_record_submission`), which re-checks the key rules
   (one stage at a time, only on a pass, no XP for a failed check, attempt not already submitted).
   The idempotency key has a unique constraint, so a double-click or network retry cannot award XP twice.
   Submitted attempts are immutable (trigger), so evidence can be audited later.
8. Browser receives the result and animates it.

## 5. Game-state management (client)

- **Phase 1:** one `GameProvider` (React context) holds the player's save and exposes actions
  (`createCharacter`, `startCampaign`, `pauseCampaign` …). Each action calls the engine, then writes the
  result through `SaveStore` (browser localStorage, validated with zod on every load).
- **Phase 2 (now):** `AuthProvider` holds the Supabase sign-in session. `GameProvider` loads the
  signed-in player's records through `GameRepository` (`src/services/game/`), validating every row
  with zod (`playerData.ts`). Each action runs the engine rule first, writes through the repository
  (only the columns the database lets players write), then reloads, so the screen always reflects
  what is stored. Display settings stay per device in localStorage. The old browser save is read only
  to offer a one-time import into the account.
- **Phase 3:** engine-owned changes (XP, mastery) go through Edge Functions calling `apply_xp_award`.
  No state-management library is needed yet.
- **UI state** (open panels, form drafts) stays in React component state.
- The client never holds a writable "source of truth" for XP or mastery.

## 6. Security boundaries

- Browser has only the Supabase **publishable key** (the config refuses a secret key). Every player
  table has RLS: `user_id = auth.uid()`. Passwords go straight to Supabase Auth; the app never stores them.
- Authoritative tables (XP ledger, mastery, boss outcomes) are **read-only** to the `authenticated`
  role; only Edge Functions (service role, server-side) write them, after running the engine.
  Players' writes are limited column by column (e.g. a character's name, never its attributes).
  Tested offline in `supabase/tests/security.test.ts`.
- AI provider keys exist only as Edge Function secrets.
- Retrieved web/source text is treated as untrusted data: delimited in prompts, never executed as
  instructions, and stripped of markup before display. Source checks fetch only public https
  addresses (no IP addresses or internal names; every redirect re-checked) with size and time
  limits; fetched text is compared by our code and is not sent to the AI. The one exception is the
  Course Builder, which is sent Wikipedia article text inside `<source>` delimiters; its quotes are
  checked against that text by our code, and nothing it writes is saved until the engine validates it.
- AI-made course content is written only by service-role functions. Players can read their own
  courses, add a mistake report for their own lessons, and close (not delete) their own subjects.
- Rate limits and per-user daily AI budgets are enforced in Edge Functions (see `AI_SYSTEM.md`).

## 7. Coding standards

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Engine code: pure functions, no `Date.now()`/`Math.random()` inside rules — time and randomness are
  passed in, so every outcome is reproducible in tests.
- No XP or threshold numbers outside `engine/progression/config.ts` (and future config files).
- Validate at every boundary: env vars, API inputs, AI outputs, content files (zod).
- Explicit `.ts` extensions in imports, so the engine runs unchanged under Deno.
- Components consume design tokens (`bg-obsidian`, `text-gold-300`), never raw hex colours.
- Every interactive control works. If a feature isn't built, the control isn't shown.
- Mock/fixture data lives in clearly named `fixtures/` folders and is labelled in the UI.
- Tests: Node's built-in test runner via `tsx` (`npm test`). Files sit next to code as `*.test.ts`.

## 8. Implementation status

| Piece | Status |
|---|---|
| Toolchain config (Vite, TS, Tailwind v4, scripts) | Tested on Windows / Node 24 (2026-11-13) |
| Design tokens | Implemented |
| Environment validation | Implemented, tested |
| Supabase client + connection check | Implemented, tested live |
| Engine: progression config + level curve | Implemented, tested |
| App shell, navigation, 6 screens, reusable components | Implemented, manually tested (Phase 1) |
| Engine: character creation, campaign lifecycle | Implemented, tested |
| Local save (validated) | Kept only to import pre-accounts characters |
| Accounts (Supabase Auth), online saves, inventory, achievements | Implemented, tested live (Phase 2) |
| Database migrations, RLS, triggers, XP function | Implemented, tested offline and applied live |
| Engine: attribute growth, XP award planning | Implemented, tested |
| Engine: learning rules (curriculum, marking, mastery, retention, weaknesses, difficulty) | Implemented, tested (Phase 3 A) |
| Learning database tables and service-role functions | Implemented, tested offline and applied live |
| `learning` Edge Function | Deployed; tested live (lesson, check, retake) |
| Authored curriculum (`src/content/curricula/`, server-side only) → generated migration | Implemented, tested; Mesopotamia geography + agriculture |
| Learning screens: campaign, lesson, check, Knowledge Codex, Weakness Bank | Implemented, tested live (Phase 3 B) |
| Curriculum generator interface | Implemented; only a labelled fixture generator exists (AI in Phase 4 C) |
| AI layer (`src/services/ai/`): provider adapter, fixtures, structured replies, limits | Implemented, tested (Phase 4 A) |
| `ai` Edge Function + `ai_requests` usage log | Deployed; tested live with Groq |
| Tutor ("Ask the Tutor" on lessons) | Implemented, tested offline and live with Groq |
| Examiner (written answers in checks) and Advanced checks | Implemented, tested offline and live with Groq (Phase 4 B) |
| Progression Advisor ("Next steps" on the dashboard) | Implemented, tested offline and live with Groq (Phase 4 B) |
| Researcher ("Further reading" on Codex entries) and server-side source checks (`src/services/research/`) | Implemented, tested offline and live with Groq (Phase 4 C1) |
| Course Builder ("Start a new subject"), Wikipedia reader, quote checks (`src/services/subjects/`) | Implemented, tested offline and live with Groq (Phase 4 C2) |
| Game Master and Strategist formats, checks and fixtures; boss-plan rules in the engine (`src/engine/encounters/`) | Implemented, tested offline and live with Groq (Phase 4 C3); no screens until Phase 5 |
| Quests (`src/engine/quests/`, `src/services/quests/`, Quests screen, quest panel on the campaign page) | Implemented, tested offline and live (Phase 5 A) |
| Boss battles (`src/engine/encounters/boss.ts`, `src/services/bosses/`, `src/services/ai/bossPlanner.ts`, boss panel, battle page `/campaigns/:id/boss/:stage`), check gate, recovery quests | Implemented, tested offline; deployed; battle not yet played live (Phase 5 B1) |
| Everything else | Not started |
