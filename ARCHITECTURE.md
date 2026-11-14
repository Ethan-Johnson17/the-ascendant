# The Ascendant — Architecture

Status: **Phase 0 draft.** This describes the target architecture and marks what exists today.
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
  app/          App root, router, providers (Phase 1)
  pages/        One component per screen (Phase 1+)
  layouts/      Shell, navigation frames (Phase 1)
  components/   Reusable UI primitives — Panel, Button, StatBar, Modal … (Phase 1)
  features/     Domain UI modules: character, campaigns, learning, quests, combat, codex,
                weaknesses, inventory, settings. Each holds hooks + components for its domain.
  engine/       ★ Deterministic game engine. Pure TS, zero dependencies on React, Supabase,
                Node or Deno. Imported by both the browser and Edge Functions.
    progression/  XP config, level curves  ← exists (Phase 0)
    competency/   mastery stages, evidence rules (Phase 2–3)
    retention/    spaced-repetition scheduling (Phase 3)
    quests/       objective + success-condition evaluation (Phase 5)
    combat/       boss eligibility, encounter state machine, resolution (Phase 5)
  content/      Authored, versioned campaign content (History pilot) as data, not code (Phase 6)
  services/     Supabase client, API client for Edge Functions  ← supabase.ts exists
  config/       Environment parsing and validation  ← exists
  types/        Shared types / schemas (zod) used on both sides of the wire
  hooks/        Generic hooks (media queries, reduced motion …)
  styles/       Design tokens (index.css) and motion tokens  ← exists
supabase/
  migrations/   Versioned SQL migrations (Phase 2)
  functions/    Edge Functions: game actions + AI orchestration (Phase 2 / 4)
```

Deviation from CLAUDE.md's suggested tree: CLAUDE.md lists `progression/`, `combat/` etc. under
`features/`. I split each into **`engine/<domain>`** (rules, no UI) and **`features/<domain>`** (UI).
This is what makes the engine "independently testable without rendering the interface" and
importable by server code. No product requirement changes.

## 4. Data flow — example: answering an assessment

1. Player submits an answer in the Learning interface.
2. Browser calls `POST /functions/v1/submit-assessment` with `{ activityId, answer, idempotencyKey }`.
3. Function loads the activity, its rubric, and the player's competency state.
4. Multiple-choice → graded deterministically by the engine. Written answer → **Examiner** role returns
   a structured evaluation (score per rubric criterion, misconceptions, error category).
5. Evaluation is validated with zod. Invalid → retry once, then fail safely ("evaluation unavailable,
   your answer is saved") — never a guessed grade.
6. Engine computes: XP award (or none if already awarded), evidence record, mastery change if the
   evidence rules are met, Weakness Bank update, next review date.
7. All changes commit in one transaction. The idempotency key has a unique constraint, so a
   double-click or network retry cannot award XP twice.
8. Browser receives the result and animates it.

## 5. Game-state management (client)

- **Server state** (character, campaigns, progress) is fetched from Supabase and cached per screen.
  Phase 1 will decide between a small hand-rolled cache and TanStack Query; the default is to avoid the
  dependency unless caching complexity justifies it.
- **UI state** (open panels, form drafts) stays in React component state.
- The client never holds a writable "source of truth" for XP or mastery.

## 6. Security boundaries

- Browser has only the Supabase **anon key**. Every player table has RLS: `user_id = auth.uid()`.
- Authoritative tables (XP ledger, mastery, boss outcomes) are **read-only** to the `authenticated`
  role; only Edge Functions (service role, server-side) write them, after running the engine.
- AI provider keys exist only as Edge Function secrets.
- Retrieved web/source text is treated as untrusted data: delimited in prompts, never executed as
  instructions, and stripped of markup before display.
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
| Toolchain config (Vite, TS, Tailwind v4, scripts) | Implemented — not yet installed/run on a real machine (see README) |
| Design tokens | Implemented |
| Environment validation | Implemented, tested |
| Supabase client + connection check | Implemented, untested against a live project |
| Engine: progression config + level curve | Implemented, tested (15 tests) |
| Everything else | Not started |
