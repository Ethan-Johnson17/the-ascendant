# Changelog

## Unreleased — Phase 4 Milestone C part 1
- "Find further reading" on Codex entries: the Researcher (AI) suggests books, articles and museum
  pages, and the server checks each one against library catalogues or the live page. Only confirmed
  ones are shown, with how they were checked. One search per idea per week; it uses 1 of your 30
  daily AI requests.
- AI logs now record why a reply needed a second try (field names only).

## Unreleased — Phase 4 Milestone B
- Written questions: every knowledge check now asks one "explain in your own words" question, marked
  by the Examiner (AI) against a rubric. You see each point you earned, quoted from your answer.
- Two new Advanced checks for Mesopotamia (geography, agriculture), made of written questions. They
  are the only way to reach the Advanced stage.
- If the Examiner isn't sure how to mark an answer, that attempt doesn't count either way.
- "Next steps" on the dashboard: what to study next, from your own records. "Explain my plan" asks the
  Advisor (AI) to explain it.
- The 30-a-day AI allowance is now shared by the Tutor, the Examiner and the Advisor.

## Unreleased — Phase 4 Milestone A
- "Ask the Tutor" on every lesson: answers come only from the lesson and its checked sources, and
  any citation the AI makes up is removed and flagged.
- AI layer that works with Groq's free tier (or any compatible provider) and with labelled
  development fixtures when no AI is connected.
- AI usage log and limits: 30 Tutor questions per player per day, 5 per minute.

## Unreleased — Phase 3 Milestone B
- First real lessons: Ancient Mesopotamia geography and agriculture (4 lessons, 5 knowledge
  checks, 15 Codex entries), each fact tied to a checked source and labelled by certainty.
- Campaign page with your learning path, competency matrix and a difficulty nudge.
- Lesson, knowledge check, Knowledge Codex and Weakness Bank screens.
- Navigation: Codex and Weakness Bank added; on phones Inventory moved to the character sheet.
- The learning database changes and server function are now live.

## Unreleased — Phase 3 Milestone A
- Learning engine rules: curriculum checker, answer marking, evidence-based mastery, retention
  reviews, Weakness Bank, adaptive difficulty and repeat-proof XP.
- Database tables for curricula, the Knowledge Codex, sources, checks and the Weakness Bank, with
  answer keys hidden from players and submitted checks made permanent.
- Server function that issues checks, marks them and records lessons (not yet deployed).
- New XP reward: first pass of each knowledge check.
- Development fixture that builds a placeholder curriculum for any subject (clearly labelled).

## Unreleased — Phase 2 Milestone B
- Accounts: sign up (with email confirmation), sign in, forgot/reset password, sign out.
- Your character and campaigns are saved to your account instead of this browser.
- Inventory screen; achievements on the character sheet.
- Download your data from the account; delete your character and progress.
- Characters saved in this browser before accounts can be imported once.

## Unreleased — Phase 2 Milestone A
- Database schema, security rules and content seed as Supabase migrations (tested offline).
- XP ledger that refuses duplicate awards and keeps campaign XP separate.
- Attribute growth rule: scores rise only from demonstrated competency mastery.
- History pilot: six sub-skills (one per attribute) and ten competencies, shown on the Campaigns screen.
- First achievements and background starting gear, granted by the database.

## 0.1.0 — 2026-11-13 — Phase 1: application foundation
- App shell with desktop sidebar and mobile bottom navigation; per-page code-splitting.
- Screens: welcome, character creation (7 steps), dashboard, character sheet, campaigns, settings.
- Character rules: all attributes start at 1; approved race/class/background content.
- Campaigns: begin, pause, resume, make current. History pilot listed as an outline.
- Progress saved in this browser (validated; corrupt data backed up). Accounts come in Phase 2.
- Settings: motion preference, download save, delete character, sample adventurer preview, system status.
- Reusable UI components and heraldic crest placeholder art.

## 0.0.2 — 2026-11-13 — Phase 0 verified
- Verified install, tests (15/15), typecheck, build and dev server on a real machine.
- Security: zod 3 → 4 (fixes a high-severity advisory); env validation moved to the zod 4 API.
- Node ≥ 22.12 now enforced at install time (`.npmrc`, `.nvmrc`).

## 0.0.1 — 2026-11-12 — Phase 0 foundation
- Project scaffold: React 19, TypeScript (strict), Vite, Tailwind v4, Framer Motion, Lucide, Supabase client.
- Design tokens for the visual identity (charcoal surfaces, muted gold, Cinzel / Cormorant / Inter).
- Validated environment configuration with a setup-friendly error list.
- Game engine started: configurable progression values and level curves, with unit tests.
- Architecture, database, AI system, cost, roadmap and testing documents.
