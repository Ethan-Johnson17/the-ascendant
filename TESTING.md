# The Ascendant — Testing

Run all automated tests: `npm test`

## Approach
- **Engine** (`src/engine/**`): unit tests for every rule. Pure functions, no mocks needed.
- **Config/validation**: unit tests for every schema boundary.
- **Database** (`supabase/tests/`): the real migration files run inside PGlite (Postgres compiled to
  WebAssembly) with a small test-only stand-in for Supabase's roles and `auth.uid()`
  (`supabase-shim.sql`). Tests act as signed-in players, signed-out visitors and the server role.
  No Docker, network or Supabase account needed. The stand-in grants Supabase's broad default
  privileges, so the tests prove the migrations lock things down themselves.
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
| XP cannot be awarded twice for the same activity | Tested (`xpAward.test.ts`, `supabase/tests/security.test.ts`) |
| Campaign XP isolated per campaign | Tested (`xpAward.test.ts`, `security.test.ts`) |
| Players cannot set their own attributes, XP, mastery or campaign completion | Tested (`security.test.ts`) |
| Attribute scores derive from competency mastery | Tested (`attributeGrowth.test.ts`); re-derived on every marked check (`learning.test.ts`) |
| Database content matches `src/content` | Tested (`supabase/tests/content-sync.test.ts`) |
| Competency progression follows defined requirements | Tested (`learning.test.ts`, `supabase/tests/learning.test.ts`) |
| Mastery decisions require evidence | Tested — two spaced passes needed; database refuses stage jumps and XP for failed checks |
| Weakness not cleared by one correct answer | Tested (`learning.test.ts`, `supabase/tests/learning.test.ts`) |
| Answer keys never reach the player before marking | Tested (column permission + `publicItem`) |
| Submitted checks cannot be changed | Tested (trigger, even for server code) |
| Bosses cannot unlock prematurely | Not started (Phase 5) |
| Boss failure does not erase permanent progression | Not started (Phase 5) |
| Users cannot access other users' records | Tested offline (`security.test.ts`); re-checked on the live project in Milestone B |
| AI outputs cannot bypass engine rules | Not started (Phase 4) |

## Current results

### 2026-11-14 — Phase 3 Milestone B (live Supabase project)
Automated: **135 tests, 135 passing**; typecheck clean; build clean. New: the content migration
matches the authored curriculum; every lesson and question is in the database; no app screen
imports the curriculum file. The production bundle was searched for curriculum identifiers: none found.

Live walkthrough in the in-app browser, signed in as the product owner's development account:

| Journey | Result |
|---|---|
| Dashboard → Continue learning → campaign page: 4 lessons, 5 checks, later checks locked, matrix shows 2 competencies with lessons | Pass |
| Read "The land between the rivers" → Complete lesson → +10 XP; four Codex entries unlocked | Pass |
| Start check: only questions and options reach the browser (no answers) | Pass |
| Submit 4/5 → Passed, +15 XP, "1 of 2 separate days", missed idea added to the Weakness Bank, explanations shown | Pass |
| Same-day retake: the weak concept is asked again; 5/5 → no XP, still 1 of 2 days, early practice not counted as a review | Pass |
| Weakness Bank: entry shows category, 0/3 reviews, next review date, "Practise early" link | Pass |
| Codex: entries in lesson order, statuses (learned / practised / needs review / not yet learned), expand shows explanation and references | Pass |
| Phone width (375 px): six-tab bar fits after shortening labels; no sideways scroll | Pass |
| Every Supabase request on the campaign page returns 200 | Pass |

Not covered yet: a pass on a second day (needs 20 hours); clearing a weakness on live (needs due
dates; tested offline); ordering and matching questions in the browser (5 of the 35 questions; none
was picked in these two checks); retention reviews coming due; real phones.

### 2026-11-14 — Phase 3 Milestone A (offline)
Automated: **132 tests, 132 passing**; typecheck clean; build clean.

New: `src/engine/learning/learning.test.ts` (30: curriculum checks, marking, mastery, retention,
Weakness Bank, difficulty, whole-check decisions), `supabase/tests/learning.test.ts` (14: the full
loop through the same service code the Edge Function runs, against the real migrations — first-pass
XP only, second-day stage advance, review XP, locked/paused/duplicate refusals, lesson completion,
weakness clearing, isolation between players, forged outcomes refused by the database, immutable
attempts, deletion), `src/services/learning/serverSafe.test.ts` (the Edge Function reaches only
Deno-safe code).

Not yet tested: the Edge Function running on Supabase's Deno runtime (not deployed; no Deno or
Docker on this machine). Planned for Milestone B together with the screens.

### 2026-11-14 — Phase 2 Milestone B (live Supabase project)
Automated: **87 tests, 87 passing**; typecheck clean; build clean (large libraries split into
cacheable files, no size warning).

Live walkthrough in the in-app browser against the real project:

| Journey | Result |
|---|---|
| Signed-out visit to `/` → Welcome; sign-up, sign-in screens render; no console errors | Pass |
| Sample adventurer without an account: dashboard, inventory, character sheet with achievements, settings | Pass |
| Phone width: five-item bottom navigation fits (75×64 px targets), no sideways scroll | Pass |
| Sign up → confirmation email → link signs in → sent to character creation (done by the product owner) | Pass |
| Character created; survives a full reload (read back from the database), all attributes 1, XP 0 | Pass |
| Background starting gear and "The Oath Is Sworn" granted automatically by the database | Pass |
| Begin History campaign → "First Steps" earned; pause → resume; each saved | Pass |
| Download my data: labelled JSON with character, campaign, gear, achievements, account email | Pass |
| From the signed-in browser, directly try to: raise Intelligence, set XP, write the XP ledger, call the XP function, complete a campaign | All refused by the database; character unchanged |

Not covered yet: password-reset email round trip; importing a pre-accounts browser save (needs a
browser that has one); "Delete character and progress" on a live account (rule tested offline);
real phones.

### 2026-11-14 — Phase 2 Milestone A
Automated: **75 tests, 75 passing** (52 app/engine, 23 database); typecheck clean; build clean.

Database tests cover: profile created on sign-up; new character starts with all attributes at 1,
zero XP, background starting gear and the first achievement; player-supplied attributes or XP refused;
no character for another user; one character per player; bad races and names rejected; rename allowed
but attributes/XP not editable; another player's rows invisible and unchangeable across all seven
player tables; signed-out visitors read content only; campaign start creates Novice progress for all
ten competencies; no duplicate campaigns; pause/resume allowed; completion and campaign XP not
player-editable; mastery not player-editable; another player's private template refused; players
cannot call the XP function or write the ledger; duplicate XP refused; campaign XP isolated; XP
cannot be credited to someone else's campaign; "delete my progress" removes only the caller's data.

Not covered yet: the same rules on a live Supabase project (Milestone B).

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
