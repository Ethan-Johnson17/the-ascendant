# The Ascendant — Roadmap

Status legend: **Not started · In progress · Implemented · Tested · Blocked**
"Implemented" means the code exists. "Tested" means automated and/or manual tests passed.
An interface existing does not make a feature implemented.

Phase order follows `MASTER_PROMPT.md` (product owner's instruction, 2026-11-13), where it differs from `CLAUDE.md`.

## Phase 0 — Project inspection and technical foundation — *Tested (complete 2026-11-13)*

Verified on the product owner's Windows 11 machine with Node 24.21 (see `TESTING.md`).

| Item | Status |
|---|---|
| Repository inspection | Tested — no prior code existed |
| Architecture documented (`ARCHITECTURE.md`) | Implemented |
| Database architecture proposed (`DATABASE_SCHEMA.md`) | Implemented (design only — awaiting approval) |
| AI architecture designed (`AI_SYSTEM.md`) | Implemented (design only) |
| Free tiers and costs (`COSTS.md`) | Implemented |
| TypeScript, Vite, Tailwind v4, test runner configured | Tested — `npm install`, `npm test`, `npm run typecheck`, `npm run build`, `npm run dev` all pass |
| Node version enforced (`engines` ≥ 22.12, `.npmrc` engine-strict, `.nvmrc`) | Tested — Node 18 install is refused with a clear message |
| Dependency security audit | Tested — 0 vulnerabilities (zod upgraded 3 → 4 to fix GHSA-mrhx-c7xc-m3w5) |
| Environment variable handling | Tested (3 tests) |
| Design tokens | Tested — render correctly in the browser (desktop and 375 px mobile) |
| Supabase connectivity | Implemented — untested until a Supabase project exists (Phase 2) |
| Engine: progression config and level curve | Tested (12 tests) |
| Git repository / GitHub | Tested — github.com/Ethan-Johnson17/the-ascendant, `main` branch |
| GAME_DESIGN.md, CLAUDE.md, MASTER_PROMPT.md in the repo | Implemented |

**Known, accepted for now:** the production bundle is ~660 KB (warning only). Phase 1 adds per-page
code-splitting as part of routing.

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
   8 = testing + release. **Resolution: following the master prompt** (confirmed by the product owner
   2026-11-13); CLAUDE.md's deployment-readiness items (PWA, backups, Capacitor assessment) are folded
   into Phase 8. CLAUDE.md Part 18 still shows the old order — recommend updating it to match.
   Consequence for Phase 1: CLAUDE.md's Phase 1 asks for campaign dashboard, skill tree, learning and
   boss screens; the master prompt's Phase 1 asks for shell, navigation, dashboard, character creation,
   character sheet, campaign selection and settings. We build the master prompt's list; the other
   screens arrive with the phases that give them real data (3 and 5).
2. **Documentation file lists differ.** Master prompt asks for `CHANGELOG.md`; CLAUDE.md asks for
   `DEVELOPMENT_LOG.md`, `DATABASE_SCHEMA.md`, `AI_SYSTEM.md`, `TESTING.md`, `README.md`. Resolution: maintain all.
3. **Screen lists differ slightly.** Design doc has "NPC interaction" and "Victory/defeat cinematic";
   CLAUDE.md has "Character sheet" and "Battle resolution". Resolution: build the union.
4. **Schema refinements** proposed in `DATABASE_SCHEMA.md` (definitions vs. progress, ledgers) — awaiting approval.
5. **Node version.** The Phase 0 README said "Node 22 or newer" but nothing enforced it; on Node 18
   the tools fail with confusing errors. Now enforced (see Phase 0 table).
6. **Unspecified mechanics** that will need your call before Phase 2: attribute allocation method
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
