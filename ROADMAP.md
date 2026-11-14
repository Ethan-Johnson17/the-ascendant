# The Ascendant — Roadmap

Status legend: **Not started · In progress · Implemented · Tested · Blocked**
"Implemented" means the code exists. "Tested" means automated and/or manual tests passed.
An interface existing does not make a feature implemented.

Phase order follows the Master Project Execution Prompt (the most recent instruction document).

## Phase 0 — Project inspection and technical foundation — *In progress (awaiting first install on a real machine)*

| Item | Status |
|---|---|
| Repository inspection | Tested — no prior code existed |
| Architecture documented (`ARCHITECTURE.md`) | Implemented |
| Database architecture proposed (`DATABASE_SCHEMA.md`) | Implemented (design only) |
| AI architecture designed (`AI_SYSTEM.md`) | Implemented (design only) |
| Free tiers and costs (`COSTS.md`) | Implemented |
| TypeScript, Vite, Tailwind v4, test runner configured | Implemented — **`npm install` not yet run** (build sandbox had no package access) |
| Environment variable handling | Tested (3 tests) |
| Design tokens | Implemented |
| Supabase connectivity | Implemented — untested until a Supabase project exists |
| Engine: progression config and level curve | Tested (12 tests) |
| Git repository / GitHub | Blocked — needs your decision on where the code lives |
| GAME_DESIGN.md and CLAUDE.md copied into the repo | Not started — copy from the Claude project once the repo exists |

## Phase 1 — Application foundation and visual identity — *Not started*
App shell, navigation, responsive layouts, dashboard, character creation UI, character sheet,
campaign selection, settings, reusable components. Mock data clearly labelled.

## Phase 2 — Character and game systems — *Not started*
Migrations + RLS, auth, character creation persisted, races/classes/backgrounds, attributes, XP
ledger with idempotency, leveling, competencies, achievements, equipment.

## Phase 3 — Learning engine — *Not started*
Curriculum structures, objectives, activities, assessments, evidence-based mastery, adaptive
difficulty, spaced repetition, Weakness Bank, Knowledge Codex.

## Phase 4 — AI integration — *Not started*
Six roles, provider abstraction, schema validation, retries, context management, citations, limits.

## Phase 5 — Campaigns, quests, and encounters — *Not started*
## Phase 6 — First playable campaign: History / Ancient Mesopotamia — *Not started*
## Phase 7 — Presentation and cinematics — *Not started*
## Phase 8 — Testing and release preparation — *Not started*

---

## Documentation contradictions found (Phase 0 review)

1. **Two different phase lists.** CLAUDE.md: Phase 1 = visual prototype (mock data), 2 = core app,
   5 = quests+combat+cinematics, 6 = history, 7 = testing, 8 = deployment. Master prompt: 1 = foundation
   + visual identity, 2 = character systems, 5 = campaigns/quests, 6 = history, 7 = cinematics,
   8 = testing + release. **Resolution: following the master prompt**; CLAUDE.md's deployment-readiness
   items (PWA, backups, Capacitor assessment) are folded into Phase 8. Recommend updating CLAUDE.md to match.
2. **Documentation file lists differ.** Master prompt asks for `CHANGELOG.md`; CLAUDE.md asks for
   `DEVELOPMENT_LOG.md`, `DATABASE_SCHEMA.md`, `AI_SYSTEM.md`, `TESTING.md`, `README.md`. Resolution: maintain all.
3. **Screen lists differ slightly.** Design doc has "NPC interaction" and "Victory/defeat cinematic";
   CLAUDE.md has "Character sheet" and "Battle resolution". Resolution: build the union.
4. **Schema refinements** proposed in `DATABASE_SCHEMA.md` (definitions vs. progress, ledgers) — awaiting approval.
5. **Unspecified mechanics** that will need your call before Phase 2: attribute allocation method
   (point-buy vs. standard array vs. rolling), what each race/class/background actually grants, and
   how attributes affect gameplay (e.g. boss checks) given they're shared across subjects.

## Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free AI tiers are small and change without notice | Beta testers hit limits | Provider abstraction, fixtures, per-user budgets, local Ollama option |
| AI evaluation of written answers is inconsistent | Unfair mastery decisions | Explicit rubrics, confidence scores, multiple evidence pieces required per mastery stage, MCQ graded deterministically |
| Fabricated or broken citations | Core trust failure | Cite only verified source IDs; automated URL/quote checks; human review for the History pilot |
| Client-side tampering with progress | Fake XP | Authoritative engine runs server-side; RLS read-only on ledgers |
| Supabase free project pauses after 7 idle days | Beta outage | Scheduled ping or Pro plan before public beta |
| Scope (8 phases, many subsystems) | Slow progress | Strict phase order; keep app runnable at every milestone |
| Edge Function time limits vs. slow AI responses | Timeouts | Short focused calls; streaming for narration |
