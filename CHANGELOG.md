# Changelog

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
