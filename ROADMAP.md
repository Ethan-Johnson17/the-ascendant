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
| Database architecture proposed (`DATABASE_SCHEMA.md`) | Implemented (design only — approved 2026-11-13) |
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

## Phase 1 — Application foundation and visual identity — *Tested (2026-11-13, PR awaiting review)*

| Item | Status |
|---|---|
| App shell: desktop sidebar, mobile bottom navigation, skip link, safe-area padding | Tested |
| Routing with per-page code-splitting; new players routed to onboarding | Tested |
| Welcome / onboarding screen | Tested |
| Character creation (7 steps: name, race, class, background, crest, story, review) | Tested — engine-validated, attributes all start at 1 |
| Main dashboard (character, current campaign, road ahead, attributes) | Tested |
| Character sheet (level, attributes, trait/ability, gear, story, campaign levels) | Tested |
| Campaign selection: begin, pause, resume, make current | Tested — History pilot listed as an outline only |
| Settings: motion preference, download save, delete character, sample preview, system status | Tested |
| Reusable components (Button, Panel, PageHeader, ProgressBar, Badge, Notice, TextField/TextArea, OptionCard, ConfirmDialog, Crest, AttributeTile) | Implemented, used across all screens |
| Engine: character creation rules, campaign lifecycle | Tested (unit tests) |
| Local save (validated; corrupt data set aside, never silently destroyed) | Tested |
| Error screen if a page crashes | Implemented |
| Sample adventurer fixture (`src/fixtures/`, labelled "Sample data" in the UI, memory-only) | Mocked — by design |
| Storage | Replaced by Supabase accounts in Phase 2 Milestone B |
| Character artwork | Placeholder — heraldic crests. Source decided 2026-11-14: free-licence first, AI stills as backup |
| Edit character after creation | Not started |

Screens CLAUDE.md lists for Phase 1 but `MASTER_PROMPT.md` places later (campaign dashboard, skill tree,
learning interface, boss interface) arrive with the phases that give them real data (3 and 5).
They are not shown in navigation until they work.

## Phase 2 — Character and game systems — *Complete (merged 2026-11-14, PR #3)*

Split into two milestones. **A** needs nothing from the product owner; **B** needs a Supabase project.

### Milestone A — database, rules and tests — *Tested offline (2026-11-14)*

| Item | Status |
|---|---|
| Decisions recorded: sub-skill per attribute, growth formula, accounts (`GAME_DESIGN.md`) | Implemented |
| Database migrations: content tables, player tables, triggers, functions | Tested offline (PGlite) — not yet applied to a real Supabase project |
| Row Level Security and column-level permissions on every table | Tested offline (23 database tests) |
| Content seed (races, classes, backgrounds, crests, starting gear, achievements, History pilot outline) | Tested — a test fails if the seed and `src/content` drift apart |
| XP ledger: duplicate awards refused, campaign XP isolated, totals = ledger sum | Tested (engine + database) |
| Engine: attribute growth from competency mastery | Tested (unit tests) — wired to real evidence in Phase 3 |
| Engine: XP award planning with idempotency keys | Tested (unit tests) |
| History pilot: six sub-skills and ten competencies, each tied to an attribute | Implemented, shown on the Campaigns screen |
| Achievements: "The Oath Is Sworn", "First Steps" (granted by the database) | Tested offline |
| Starting gear granted from background | Tested offline |
| "Delete my progress" (only the caller's data) | Tested offline |

### Milestone B — accounts and the online app — *Tested live (2026-11-14)*

| Item | Status |
|---|---|
| Supabase project connected; migrations applied (`supabase db push --remote`) | Tested live |
| Sign up with email confirmation | Tested live by the product owner |
| Sign in, sign out | Implemented; sign-out tested in the browser |
| Forgot password / choose new password | Implemented — not yet tested with a real reset email |
| Character, campaigns, gear and achievements saved to the account and reloaded | Tested live |
| Begin / pause / resume campaign online | Tested live |
| Inventory screen | Tested live |
| Achievements on the character sheet | Tested live |
| Download my data (from the account) | Tested live |
| Delete character and progress | Implemented; database rule tested offline (not run on the owner's account) |
| Import a character saved in this browser before accounts | Implemented — not tested live (no such save in the test browser) |
| Players cannot raise their own attributes, XP or completion (live attempts from a signed-in browser) | Tested live — all refused |
| Display settings stored per device | Tested (unit tests) |
| Deleting the sign-in account itself | Not started — planned before public beta |
| Custom SMTP for sign-up and reset emails | Not started — required before beta (`COSTS.md`) |
| Sign in with Google | Not started (decided: later) |

XP is not yet *earned* through play — awards come from server functions when lessons exist (Phase 3).

## Phase 3 — Learning engine — *Complete (merged 2026-11-15, PR #4). Lesson text accepted by the product owner "for now"*
Curriculum structures, objectives, activities, assessments, evidence-based mastery, adaptive
difficulty, spaced repetition, Weakness Bank, Knowledge Codex.

Rules decided by the product owner 2026-11-14 (GAME_DESIGN.md §5 "Learning rules").

### Milestone A — engine, database and server function (no screens)

| Item | Status |
|---|---|
| Curriculum format (Subject → Discipline → Topic → Objective → Activity → Question) and validator | Completed, tested |
| Marking multiple-choice, ordering and matching questions | Completed, tested |
| Evidence-based mastery (two passes ≥ 20 h apart; capped at Proficient) | Completed, tested |
| Retention scheduling (1, 3, 7, 14, 30, 60, 120 days) | Completed, tested |
| Weakness Bank (three correct due reviews to clear; never deleted) | Completed, tested |
| Adaptive difficulty and question selection | Completed, tested |
| XP: first lesson completion, first check pass, due retention reviews only | Completed, tested |
| Database: curricula, Codex, sources, questions (answer keys hidden), attempts (immutable), Weakness Bank | Completed, tested offline — **not yet applied to the live project** |
| `learning` Edge Function (start check, submit check, complete lesson) | Implemented; logic tested offline through the same service code. **Not yet deployed** (no Deno locally) |
| Curriculum generation for any subject: interface + labelled fixture | Completed, tested. AI-made subjects arrived in Phase 4 C2 (Course Builder) |
| Written answers (need AI marking) | Completed in Phase 4 Milestone B |
| Advanced/Expert mastery (need applied evidence) | Planned — Phases 4–5 |

### Milestone B — content and screens — *Built and tested live (2026-11-14)*

| Item | Status |
|---|---|
| Learning migration applied to the live project; `learning` Edge Function deployed | Completed, tested live |
| Mesopotamia lessons: Geography and environment, Agriculture and settlement (4 lessons, 5 checks, 35 questions, 15 Codex entries, 6 checked sources) | Completed. Accepted by the product owner for now (2026-11-15) |
| Content kept in code, turned into a migration (`npm run content:sql`); a test fails if they drift apart | Completed, tested |
| Campaign page: curriculum path, locks, review reminders, difficulty nudge, competency matrix | Completed, tested live |
| Lesson screen with certainty labels and references; Complete lesson | Completed, tested live |
| Check screen: server-issued questions, marking, explanations, mastery, Weakness Bank and XP feedback | Completed, tested live (single choice). Ordering and matching questions tested offline only |
| Knowledge Codex: search, filters, locked entries point to their lesson, related entries, references | Completed, tested live |
| Weakness Bank: due reviews first, x/3 progress, review link, resolved list | Completed, tested live (adding); clearing tested offline (needs days to pass) |
| The other eight history competencies | Planned — Phase 6 |
| Unit tests for the screen data builder (`buildCampaignLearning`) | Planned (covered by live walkthrough for now) |

## Phase 4 — AI integration — *Completed (2026-11-16)*
Rules decided by the product owner 2026-11-16 (GAME_DESIGN.md "AI rules"): Groq free tier
(`gpt-oss-120b`) behind a provider-independent layer; Tutor first; written answers count toward mastery
only when the Examiner is confident; 30 AI requests per player per day.

### Milestone A — AI foundation and the Tutor — *Built and tested live with Groq (2026-11-16)*

| Item | Status |
|---|---|
| Provider layer: one OpenAI-compatible adapter (Groq default) + labelled development fixtures | Completed, tested |
| Answer checking: strict format, one repair attempt, retry after timeouts/outages, no invented fallback | Completed, tested |
| Usage log (`ai_requests`: tokens and outcome, never text) and limits (30 a rolling day, 5 a minute), enforced atomically in the database | Completed, tested offline; applied live |
| `ai` Edge Function | Deployed; live check passed (signs in, reads usage, reports "not set up" with no key) |
| Tutor: answers only from the lesson, its Codex entries and checked sources; invented citations removed and flagged; player text treated as data | Completed, tested offline and live with Groq (grounded answer, uncovered question, off-topic, injection attempt) |
| "Ask the Tutor" on every lesson | Completed, tested live |
| Log why a reply needed a repair (field names only, no text) | Planned. 2 of 4 live answers needed one |

### Milestone B — Examiner (written answers) and Progression Advisor — *Built and tested live with Groq (2026-11-16)*
Decided 2026-11-16: written questions both inside existing checks and in new Advanced checks; an unsure
mark means the whole attempt doesn't count; the Advisor's plan is always shown, and the AI explains it
on request.

| Item | Status |
|---|---|
| Written questions with rubrics (engine adds up the points; rubric and model answer hidden until marked) | Completed, tested |
| Examiner role: per-criterion judgement, each "met" must quote the answer, high confidence required | Completed, tested offline and live with Groq |
| Unsure marking → the attempt is recorded but changes nothing | Completed, tested offline (live: not yet seen) |
| Without the Examiner: checks up to Proficient drop their written question; Advanced checks wait | Completed, tested offline |
| Advanced (stage 5) reachable only with confidently marked written work; database enforces it | Completed, tested offline |
| Mesopotamia: one written question in each of the 5 checks; 2 new Advanced checks (geography, agriculture) | Completed; content version 2 applied live |
| Check screen: written answer box, Examiner note, rubric feedback, "didn't count" banner | Completed, tested live |
| Progression Advisor: engine plan on the dashboard ("Next steps"); "Explain my plan" (AI) | Completed, tested offline and live with Groq |
| Advanced checks taken live | Not yet (no competency is Proficient on the test account) |
| Log why a reply needed a repair (field names only, no text) | Completed in Milestone C part 1 |
### Milestone C — Researcher and AI curricula for any subject; Game Master and Strategist formats — *Completed (2026-11-16)*
Decided 2026-11-16: grounding from Wikipedia plus verified extra sources; AI-made subjects use the
same rules, clearly labelled; building counts against the 30-a-day allowance. Built in three parts:

| Part | Contents | Status |
|---|---|---|
| C1 | Researcher ("Find further reading" on Codex entries); server-side source checks (Open Library, Crossref, trusted web pages); repair-reason logging | Completed; tested offline and live with Groq (2026-11-16) |
| C2 | "Start a new subject": AI outline, then lessons and checks built one at a time from fetched source text; "AI-generated" labels; report-a-mistake. Decided 2026-11-16: 4 lessons, harmful topics refused (advice topics labelled), reports flag the lesson, 3 AI subjects per player | Completed; tested offline and live with Groq (2026-11-16). Lessons can't be rebuilt yet |
| C3 | Game Master and Strategist reply formats, checks and fixtures (used in Phase 5). Decided 2026-11-16: groundwork only, nothing new on screen until Phase 5; bosses use only the course's already-checked questions | Completed; tested offline and live with Groq (2026-11-16) |

## Phase 5 — Campaigns, quests, and encounters — *In progress (decisions made 2026-11-16)*
Decided 2026-11-16: quests from game templates with AI story; a boss at each stage (Apprentice,
Competent, Proficient), each unlocking the next stage's checks; Resolve points (3, Dwarves 4); retry
after a recovery quest. Built in
three parts:

| Part | Contents | Status |
|---|---|---|
| A | Quests: templates built from each course, objectives and success conditions, completion records, XP, Game Master narration, quest screen | Completed; tested offline and live (2026-11-17) |
| B | Boss battles: one per stage, each gating the next stage's checks; unlock rules, Resolve combat, race traits and class abilities, victory reward, defeat → recovery quest → retry, battle result screen | Not started |
| C | Practical projects and free-form talk with characters; "go deeper" for AI-made courses (harder checks, so they can pass Competent) | Not started |
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
   into Phase 8. CLAUDE.md Part 18 was updated to match on 2026-11-14.
   Consequence for Phase 1: CLAUDE.md's Phase 1 asks for campaign dashboard, skill tree, learning and
   boss screens; the master prompt's Phase 1 asks for shell, navigation, dashboard, character creation,
   character sheet, campaign selection and settings. We build the master prompt's list; the other
   screens arrive with the phases that give them real data (3 and 5).
2. **Documentation file lists differ.** Master prompt asks for `CHANGELOG.md`; CLAUDE.md asks for
   `DEVELOPMENT_LOG.md`, `DATABASE_SCHEMA.md`, `AI_SYSTEM.md`, `TESTING.md`, `README.md`. Resolution: maintain all.
3. **Screen lists differ slightly.** Design doc has "NPC interaction" and "Victory/defeat cinematic";
   CLAUDE.md has "Character sheet" and "Battle resolution". Resolution: build the union.
4. **Schema refinements** proposed in `DATABASE_SCHEMA.md` — **approved 2026-11-13.**
5. **Node version.** The Phase 0 README said "Node 22 or newer" but nothing enforced it; on Node 18
   the tools fail with confusing errors. Now enforced (see Phase 0 table).
6. **Character mechanics** — **decided 2026-11-13** (recorded in `GAME_DESIGN.md` §3): attributes all
   start at 1 and grow only from demonstrated knowledge; race/class/background affect encounter tactics
   and story only. Race attribute bonuses from the first proposal were dropped because they conflict
   with the start-at-1 rule (confirmed 2026-11-14; may be revisited later). Artwork: free-licence
   first, AI stills as backup (`GAME_DESIGN.md` §14). CLAUDE.md Part 18 updated to the master
   prompt's phase order (2026-11-14). **Still open:** the attribute growth formula (Phase 2–3) and beta AI
   provider (Phase 4).

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
