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
2026-11-12 — 15 tests, 15 passing (Node 22 test runner). Engine and config typecheck clean under strict TS.
UI compiles (bundled with esbuild); not yet run in Vite or a browser.
