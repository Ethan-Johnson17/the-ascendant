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
| Attributes start at 1 for every race/class/background | Tested (`createCharacter.test.ts`) |
| Campaigns are independent; pause/resume keeps progress | Tested (`campaigns.test.ts`), local only until Phase 2 |
| Stored save is validated; tampered/corrupt data rejected and backed up | Tested (`saveStore.test.ts`) |
| XP cannot be awarded twice for the same activity | Not started (Phase 2) |
| Campaign XP isolated per campaign | Partly tested in the engine (`campaigns.test.ts`); database ledger in Phase 2 |
| Competency progression follows defined requirements | Not started (Phase 3) |
| Mastery decisions require evidence | Not started (Phase 3) |
| Bosses cannot unlock prematurely | Not started (Phase 5) |
| Boss failure does not erase permanent progression | Not started (Phase 5) |
| Users cannot access other users' records | Not started (Phase 2) |
| AI outputs cannot bypass engine rules | Not started (Phase 4) |

## Current results

### 2026-11-13 — Phase 1
Automated: **39 tests, 39 passing**; typecheck clean; build clean (no bundle-size warning after
per-page code-splitting).

Manual walkthrough in the in-app browser (desktop and 375 px phone width):

| Journey | Result |
|---|---|
| Fresh visit → redirected to Welcome | Pass |
| Create a character through all 7 steps (Enter key, "Change" links, focus moves to each new step heading) | Pass |
| Character saved; survives reload; all attributes 1, XP 0 | Pass |
| Dashboard and character sheet show the real character | Pass |
| Begin History campaign → current campaign; pause → resume; status persisted | Pass |
| Motion setting saved and applied | Pass |
| Sample adventurer: banner shown, actions affect memory only, real save untouched, exit returns to real character | Pass |
| Download save (download intercepted in the test; correct filename, JSON file) | Pass |
| Delete: dialog shown, cancel keeps data, confirm wipes and returns to Welcome | Pass |
| Tampered save in storage → rejected, original kept as backup, warning shown | Pass |
| Phone: no horizontal scroll; no control under 44 px tall | Pass |
| No console errors across all screens | Pass (after fixing the bugs below) |

Bugs found and fixed during testing: step-heading focus lost after the animated step change; pages
opened mid-scroll after navigation; a scroll-reset effect crashed the shell (it returned a value that
React treated as a cleanup function); detailed attribute tiles cramped at mid widths; export filename
used the UTC date; save warnings not shown on the Welcome screen.

Not covered yet: real iOS Safari and Android devices (Phase 8); a full screen-reader pass.

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
