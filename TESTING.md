# The Ascendant — Testing

Run all automated tests: `npm test`

## Approach
- **Engine** (`src/engine/**`): unit tests for every rule. Pure functions, no mocks needed.
- **Config/validation**: unit tests for every schema boundary.
- **Database** (Phase 2+): migration tests and RLS tests proving one user cannot read another's rows.
- **Edge Functions** (Phase 2+): integration tests with fixture AI, including duplicate-submission tests.
- **UI** (Phase 1+): manual test scripts per screen on a phone-sized and desktop viewport; component
  tests added where logic lives in components.

## Required invariants (CLAUDE.md Part 19) — status

| Invariant | Status |
|---|---|
| Levels update correctly from XP | Tested (`levels.test.ts`) |
| XP cannot be awarded twice for the same activity | Not started (Phase 2) |
| Campaign XP isolated per campaign | Not started (Phase 2) |
| Competency progression follows defined requirements | Not started (Phase 3) |
| Mastery decisions require evidence | Not started (Phase 3) |
| Bosses cannot unlock prematurely | Not started (Phase 5) |
| Boss failure does not erase permanent progression | Not started (Phase 5) |
| Users cannot access other users' records | Not started (Phase 2) |
| AI outputs cannot bypass engine rules | Not started (Phase 4) |

## Current results

### 2026-11-13 — Phase 0 verification on a real machine
Windows 11, Node 24.21.0, npm 11.19.0.

| Check | Result |
|---|---|
| `npm install` | Pass — 104 packages, 0 vulnerabilities (after zod 3 → 4 upgrade) |
| `npm test` | Pass — 15 tests, 15 passing, 0 failing |
| `npm run typecheck` | Pass — 0 errors with the real React 19.3 / Vite 7.3 / TypeScript 6.0 types |
| `npm run build` | Pass — `dist/` produced; bundle-size warning (~660 KB JS), see ROADMAP |
| `npm run dev` → http://localhost:5173 | Pass — status screen renders, fonts and tokens load, no console errors, layout holds at 375 px |
| Engine self-check on screen | Pass — 1,500 XP → level 6, 187/445 (matches `round(100 × (L−1)^1.6)`) |
| Install on Node 18.17 | Refused with `EBADENGINE … Required: {"node":">=22.12"}` (intended) |

### 2026-11-12 — Phase 0 (build sandbox, no package access)
15 tests, 15 passing (Node 22 test runner). UI compile-checked with esbuild only; not run in Vite.
